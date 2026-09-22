function artifacts = train_unet_lesions(varargin)
%TRAIN_UNET_LESIONS Train ICare U-Net lesion segmentation on IDRiD.
%
% Examples:
%   train_unet_lesions("lesionType", "Microaneurysms", "quick", true)
%   train_unet_lesions("lesionType", "Hard Exudates", "maxEpochs", 20)
%   train_unet_lesions("lesionType", "Haemorrhages", "patchesPerImage", 24)

opts = parse_options(varargin{:});
cfg = icare_config();

trainTbl = read_idrid_lesion_dataset(cfg.dataRoot, opts.lesionType, "training");
testTbl = read_idrid_lesion_dataset(cfg.dataRoot, opts.lesionType, "testing");
fprintf("IDRiD %s training images: %d (%d masks, %d empty masks)\n", opts.lesionType, height(trainTbl), nnz(trainTbl.hasMask), nnz(~trainTbl.hasMask));
fprintf("IDRiD %s testing images: %d (%d masks, %d empty masks)\n", opts.lesionType, height(testTbl), nnz(testTbl.hasMask), nnz(~testTbl.hasMask));

if opts.quick
    rng(opts.seed);
    keep = randperm(height(trainTbl), min(height(trainTbl), opts.quickCount));
    trainTbl = trainTbl(keep, :);
    keepTest = randperm(height(testTbl), min(height(testTbl), max(1, floor(opts.quickCount / 2))));
    testTbl = testTbl(keepTest, :);
    fprintf("Quick mode enabled: using %d train and %d validation images.\n", height(trainTbl), height(testTbl));
end

imageSize = [256 256 3];
classNames = ["background", "lesion"];
labelIDs = [0 1];
numClasses = numel(classNames);
blankMaskPath = ensure_blank_lesion_mask_file(cfg, imageSize);
trainMaskPaths = fill_missing_masks(trainTbl.maskPath, blankMaskPath);
testMaskPaths = fill_missing_masks(testTbl.maskPath, blankMaskPath);
classWeights = compute_segmentation_class_weights(trainMaskPaths, imageSize, opts.maxClassWeight);
fprintf("Segmentation class weights: background %.4f, lesion %.4f\n", classWeights(1), classWeights(2));
fprintf("Loss blend: %.0f%% weighted cross-entropy, %.0f%% soft Dice.\n", ...
    (1 - opts.diceLossWeight) * 100, opts.diceLossWeight * 100);

slug = lower(regexprep(string(opts.lesionType), "[^a-zA-Z0-9]+", "_"));
if opts.usePatches
    patchTbl = generate_lesion_patch_dataset(trainTbl, trainMaskPaths, cfg, slug, imageSize, ...
        opts.patchesPerImage, opts.positivePatchRatio, opts.minPositivePixels, opts.seed);
    valPatchTbl = generate_lesion_patch_dataset(testTbl, testMaskPaths, cfg, slug + "_validation", imageSize, ...
        opts.validationPatchesPerImage, opts.positivePatchRatio, opts.minPositivePixels, opts.seed + 1);
    imdsTrain = imageDatastore(cellstr(patchTbl.imagePath), ReadFcn=@(filename) read_fundus_rgb(filename));
    pxdsTrain = pixelLabelDatastore(cellstr(patchTbl.maskPath), classNames, labelIDs, ReadFcn=@(filename) read_idrid_lesion_mask(filename, imageSize));
    imdsVal = imageDatastore(cellstr(valPatchTbl.imagePath), ReadFcn=@(filename) read_fundus_rgb(filename));
    pxdsVal = pixelLabelDatastore(cellstr(valPatchTbl.maskPath), classNames, labelIDs, ReadFcn=@(filename) read_idrid_lesion_mask(filename, imageSize));
    trainingItems = height(patchTbl);
    classWeights = compute_segmentation_class_weights(patchTbl.maskPath, imageSize, opts.maxClassWeight);
    fprintf("Patch mode enabled: generated %d training patches from %d images (%d lesion-positive patches).\n", ...
        trainingItems, height(trainTbl), nnz(patchTbl.hasLesion));
    fprintf("Patch validation enabled: generated %d validation patches from %d images (%d lesion-positive patches).\n", ...
        height(valPatchTbl), height(testTbl), nnz(valPatchTbl.hasLesion));
    fprintf("Patch-balanced class weights: background %.4f, lesion %.4f\n", classWeights(1), classWeights(2));
else
    imdsTrain = imageDatastore(cellstr(trainTbl.imagePath), ReadFcn=@(filename) read_idrid_image_for_network(filename, imageSize));
    pxdsTrain = pixelLabelDatastore(cellstr(trainMaskPaths), classNames, labelIDs, ReadFcn=@(filename) read_idrid_lesion_mask(filename, imageSize));
    imdsVal = imageDatastore(cellstr(testTbl.imagePath), ReadFcn=@(filename) read_idrid_image_for_network(filename, imageSize));
    pxdsVal = pixelLabelDatastore(cellstr(testMaskPaths), classNames, labelIDs, ReadFcn=@(filename) read_idrid_lesion_mask(filename, imageSize));
    trainingItems = height(trainTbl);
end
dsTrain = combine(imdsTrain, pxdsTrain);
dsVal = combine(imdsVal, pxdsVal);

try
    unetNet = unet(imageSize, numClasses, EncoderDepth=opts.encoderDepth);
catch ME
    error("ICare:UNet:Unavailable", ...
        "unet is unavailable. Install/enable Computer Vision Toolbox and Deep Learning Toolbox. Original error: %s", ME.message);
end

modelRoot = string(cfg.modelRoot);
if ~isfolder(modelRoot)
    mkdir(modelRoot);
end
checkpointDir = fullfile(modelRoot, "checkpoints", "unet_lesions_" + slug);
if ~isfolder(checkpointDir)
    mkdir(checkpointDir);
end

options = trainingOptions("adam", ...
    InitialLearnRate=opts.initialLearnRate, ...
    LearnRateSchedule="piecewise", ...
    LearnRateDropFactor=opts.learnRateDropFactor, ...
    LearnRateDropPeriod=opts.learnRateDropPeriod, ...
    L2Regularization=opts.l2Regularization, ...
    MaxEpochs=opts.maxEpochs, ...
    MiniBatchSize=opts.miniBatchSize, ...
    Shuffle="every-epoch", ...
    ValidationData=dsVal, ...
    ValidationFrequency=max(1, floor(trainingItems / opts.miniBatchSize)), ...
    ValidationPatience=opts.validationPatience, ...
    OutputNetwork="best-validation-loss", ...
    CheckpointPath=checkpointDir, ...
    Verbose=true, ...
    Plots=opts.plots, ...
    ExecutionEnvironment=opts.executionEnvironment);

fprintf("Starting ICare U-Net IDRiD %s lesion training.\n", opts.lesionType);
lossFcn = @(Y, T) combined_lesion_loss(Y, T, classWeights, opts.diceLossWeight);
[net, trainInfo] = trainnet(dsTrain, unetNet, lossFcn, options);

metrics = evaluate_lesion_segmentation(net, testTbl, imageSize, classNames, opts.thresholds, opts.evaluationStride);

timestamp = string(datetime("now", Format="yyyyMMdd_HHmmss"));
artifactPath = fullfile(modelRoot, "unet_lesions_" + slug + "_" + timestamp + ".mat");
if opts.quick
    latestPath = fullfile(modelRoot, "unet_lesions_" + slug + "_quick.mat");
elseif opts.usePatches
    latestPath = fullfile(modelRoot, "unet_lesions_" + slug + "_patch.mat");
else
    latestPath = fullfile(modelRoot, "unet_lesions_" + slug + ".mat");
end
deploymentPath = fullfile(modelRoot, "unet_lesions_" + slug + ".mat");
metricsPath = fullfile(modelRoot, "unet_lesions_" + slug + "_metrics_" + timestamp + ".mat");

modelVersion = "unet-lesions-" + slug + "-idrid-" + timestamp;
datasetSummary = struct();
datasetSummary.source = "IDRiD A. Segmentation";
datasetSummary.dataRoot = string(cfg.dataRoot);
datasetSummary.lesionType = string(opts.lesionType);
datasetSummary.trainCount = height(trainTbl);
datasetSummary.validationCount = height(testTbl);
datasetSummary.trainMasksPresent = nnz(trainTbl.hasMask);
datasetSummary.validationMasksPresent = nnz(testTbl.hasMask);
datasetSummary.classWeights = classWeights;
datasetSummary.diceLossWeight = opts.diceLossWeight;
datasetSummary.usePatches = opts.usePatches;
datasetSummary.patchesPerImage = opts.patchesPerImage;
datasetSummary.validationPatchesPerImage = opts.validationPatchesPerImage;
datasetSummary.positivePatchRatio = opts.positivePatchRatio;
datasetSummary.minPositivePixels = opts.minPositivePixels;
datasetSummary.evaluationStride = opts.evaluationStride;
datasetSummary.quickMode = opts.quick;
datasetSummary.note = "Missing lesion masks are treated as empty masks. Lesion training uses weighted cross-entropy plus soft Dice loss and lesion-centered patch sampling by default. Evaluation uses native-resolution tiled inference.";

save(artifactPath, "net", "trainInfo", "metrics", "modelVersion", "cfg", "datasetSummary", "-v7.3");
save(latestPath, "net", "trainInfo", "metrics", "modelVersion", "cfg", "datasetSummary", "-v7.3");
if ~strcmp(string(latestPath), string(deploymentPath)) && ~opts.quick
    save(deploymentPath, "net", "trainInfo", "metrics", "modelVersion", "cfg", "datasetSummary", "-v7.3");
end
save(metricsPath, "metrics");

artifacts = struct();
artifacts.modelVersion = modelVersion;
artifacts.modelPath = artifactPath;
artifacts.latestModelPath = latestPath;
artifacts.deploymentModelPath = deploymentPath;
artifacts.metricsPath = metricsPath;
artifacts.metrics = metrics;

fprintf("Saved ICare U-Net lesion model: %s\n", artifactPath);
if ~opts.quick
    fprintf("Updated deployment model: %s\n", deploymentPath);
end
fprintf("Validation Dice: %.4f, IoU: %.4f\n", metrics.meanDice, metrics.meanIoU);
end

function metrics = evaluate_lesion_segmentation(net, valTbl, imageSize, classNames, thresholds, evaluationStride)
scoreMaps = cell(height(valTbl), 1);
actualMasks = cell(height(valTbl), 1);

for i = 1:height(valTbl)
    img = read_fundus_rgb(valTbl.imagePath(i));
    actualMasks{i} = read_native_lesion_mask(valTbl.maskPath(i), size(img, [1 2]));
    scoreMaps{i} = predict_lesion_probability_tiled(net, img, imageSize, evaluationStride, classNames);
end

diceByThreshold = zeros(numel(thresholds), 1);
iouByThreshold = zeros(numel(thresholds), 1);
for t = 1:numel(thresholds)
    [diceScores, iouScores] = score_threshold(scoreMaps, actualMasks, thresholds(t));
    diceByThreshold(t) = mean(diceScores, "omitnan");
    iouByThreshold(t) = mean(iouScores, "omitnan");
end

[~, bestIdx] = max(diceByThreshold);
optimalThreshold = thresholds(bestIdx);
[diceScores, iouScores] = score_threshold(scoreMaps, actualMasks, optimalThreshold);

metrics = struct();
metrics.dice = diceScores;
metrics.iou = iouScores;
metrics.meanDice = mean(diceScores, "omitnan");
metrics.meanIoU = mean(iouScores, "omitnan");
metrics.optimalThreshold = optimalThreshold;
metrics.thresholds = thresholds;
metrics.meanDiceByThreshold = diceByThreshold;
metrics.meanIoUByThreshold = iouByThreshold;
metrics.evaluationMode = "native-resolution tiled";
metrics.evaluationTileSize = imageSize(1:2);
metrics.evaluationStride = evaluationStride;
metrics.evaluatedAt = string(datetime("now", TimeZone="local", Format="yyyy-MM-dd HH:mm:ss Z"));
end

function probabilityMap = predict_lesion_probability_tiled(net, img, imageSize, stride, classNames)
tileSize = imageSize(1:2);
imgSize = size(img, [1 2]);
yStarts = tile_starts(imgSize(1), tileSize(1), stride);
xStarts = tile_starts(imgSize(2), tileSize(2), stride);
probabilitySum = zeros(imgSize, "single");
voteCount = zeros(imgSize, "single");

for y = yStarts
    for x = xStarts
        [tile, bounds] = crop_tile(img, [y x], tileSize);
        tileProbability = predict_lesion_tile_probability(net, tile, classNames);
        targetRows = bounds.srcY1:bounds.srcY2;
        targetCols = bounds.srcX1:bounds.srcX2;
        tileRows = bounds.dstY1:bounds.dstY2;
        tileCols = bounds.dstX1:bounds.dstX2;
        probabilitySum(targetRows, targetCols) = probabilitySum(targetRows, targetCols) + single(tileProbability(tileRows, tileCols));
        voteCount(targetRows, targetCols) = voteCount(targetRows, targetCols) + 1;
    end
end

voteCount(voteCount == 0) = 1;
probabilityMap = double(probabilitySum ./ voteCount);
end

function probabilities = predict_lesion_tile_probability(net, tile, classNames)
try
    predictedScores = minibatchpredict(net, single(tile));
catch
    predictedLabels = semanticseg(tile, net, Classes=classNames);
    probabilities = double(predictedLabels == "lesion");
    return;
end
if size(predictedScores, 3) ~= 2
    error("ICare:Segmentation:UnexpectedOutputChannels", ...
        "Expected two segmentation channels from lesion U-Net, got %d.", size(predictedScores, 3));
end
probabilities = lesion_probability(predictedScores);
end

function starts = tile_starts(fullLength, tileLength, stride)
if fullLength <= tileLength
    starts = 1;
    return;
end
starts = 1:stride:(fullLength - tileLength + 1);
lastStart = fullLength - tileLength + 1;
if starts(end) ~= lastStart
    starts = [starts lastStart];
end
end

function [tile, bounds] = crop_tile(img, startYX, tileSize)
y1 = startYX(1);
x1 = startYX(2);
y2 = min(size(img, 1), y1 + tileSize(1) - 1);
x2 = min(size(img, 2), x1 + tileSize(2) - 1);

tile = zeros([tileSize size(img, 3)], "like", img);
tileRows = 1:(y2 - y1 + 1);
tileCols = 1:(x2 - x1 + 1);
tile(tileRows, tileCols, :) = img(y1:y2, x1:x2, :);

bounds = struct();
bounds.srcY1 = y1;
bounds.srcY2 = y2;
bounds.srcX1 = x1;
bounds.srcX2 = x2;
bounds.dstY1 = tileRows(1);
bounds.dstY2 = tileRows(end);
bounds.dstX1 = tileCols(1);
bounds.dstX2 = tileCols(end);
end

function probabilities = lesion_probability(scores)
scores = double(extractdata(scores));
if size(scores, 4) > 1
    scores = scores(:, :, :, 1);
end
channelSum = scores(:, :, 1) + scores(:, :, 2);
if all(channelSum(:) >= 0.99 & channelSum(:) <= 1.01)
    probabilities = scores(:, :, 2);
else
    shifted = scores - max(scores, [], 3);
    expScores = exp(shifted);
    probabilities = expScores(:, :, 2) ./ sum(expScores, 3);
end
end

function [diceScores, iouScores] = score_threshold(scoreMaps, actualMasks, threshold)
diceScores = zeros(numel(scoreMaps), 1);
iouScores = zeros(numel(scoreMaps), 1);
for i = 1:numel(scoreMaps)
    predicted = scoreMaps{i} >= threshold;
    actual = actualMasks{i};
    intersection = nnz(predicted & actual);
    union = nnz(predicted | actual);
    diceScores(i) = safe_divide(2 * intersection, nnz(predicted) + nnz(actual));
    iouScores(i) = safe_divide(intersection, union);
end
end

function value = safe_divide(numerator, denominator)
if denominator == 0
    value = NaN;
else
    value = numerator / denominator;
end
end

function maskPaths = fill_missing_masks(maskPaths, blankMaskPath)
maskPaths = string(maskPaths);
missing = strlength(maskPaths) == 0 | ~isfile(maskPaths);
maskPaths(missing) = string(blankMaskPath);
end

function blankMaskPath = ensure_blank_lesion_mask_file(cfg, imageSize)
blankDir = fullfile(string(cfg.modelRoot), "generated_empty_masks");
if ~isfolder(blankDir)
    mkdir(blankDir);
end
blankMaskPath = fullfile(blankDir, "empty_lesion_mask.png");
if ~isfile(blankMaskPath)
    imwrite(false(imageSize(1), imageSize(2)), blankMaskPath);
end
end

function opts = parse_options(varargin)
parser = inputParser;
addParameter(parser, "lesionType", "Microaneurysms", @(x) strlength(string(x)) > 0);
addParameter(parser, "quick", false, @(x) islogical(x) || isnumeric(x));
addParameter(parser, "quickCount", 8, @(x) isnumeric(x) && x > 1);
addParameter(parser, "maxEpochs", 20, @(x) isnumeric(x) && x > 0);
addParameter(parser, "miniBatchSize", 1, @(x) isnumeric(x) && x > 0);
addParameter(parser, "initialLearnRate", 1e-3, @(x) isnumeric(x) && x > 0);
addParameter(parser, "learnRateDropFactor", 0.5, @(x) isnumeric(x) && x > 0 && x < 1);
addParameter(parser, "learnRateDropPeriod", 8, @(x) isnumeric(x) && x > 0);
addParameter(parser, "l2Regularization", 1e-4, @(x) isnumeric(x) && x >= 0);
addParameter(parser, "validationPatience", 6, @(x) isnumeric(x) && x > 0);
addParameter(parser, "maxClassWeight", 50, @(x) isnumeric(x) && x >= 1);
addParameter(parser, "diceLossWeight", 0.5, @(x) isnumeric(x) && x >= 0 && x <= 1);
addParameter(parser, "encoderDepth", 3, @(x) isnumeric(x) && x >= 2);
addParameter(parser, "thresholds", 0.05:0.05:0.95, @(x) isnumeric(x) && all(x > 0) && all(x < 1));
addParameter(parser, "usePatches", true, @(x) islogical(x) || isnumeric(x));
addParameter(parser, "patchesPerImage", 12, @(x) isnumeric(x) && x > 0);
addParameter(parser, "validationPatchesPerImage", 6, @(x) isnumeric(x) && x > 0);
addParameter(parser, "positivePatchRatio", 0.85, @(x) isnumeric(x) && x >= 0 && x <= 1);
addParameter(parser, "minPositivePixels", 8, @(x) isnumeric(x) && x >= 1);
addParameter(parser, "evaluationStride", 256, @(x) isnumeric(x) && x >= 1);
addParameter(parser, "executionEnvironment", "auto", @(x) ismember(string(x), ["auto", "cpu", "gpu", "multi-gpu", "parallel"]));
addParameter(parser, "plots", "training-progress", @(x) ismember(string(x), ["none", "training-progress"]));
addParameter(parser, "seed", 26038, @(x) isnumeric(x));
parse(parser, varargin{:});
opts = parser.Results;
opts.quick = logical(opts.quick);
opts.lesionType = string(opts.lesionType);
opts.thresholds = double(opts.thresholds(:)');
opts.usePatches = logical(opts.usePatches);
opts.positivePatchRatio = double(opts.positivePatchRatio);
opts.minPositivePixels = double(opts.minPositivePixels);
opts.evaluationStride = double(opts.evaluationStride);
end

function patchTbl = generate_lesion_patch_dataset(trainTbl, maskPaths, cfg, slug, imageSize, patchesPerImage, positivePatchRatio, minPositivePixels, seed)
rng(seed);
patchRoot = fullfile(string(cfg.modelRoot), "generated_lesion_patches", slug);
imageRoot = fullfile(patchRoot, "images");
maskRoot = fullfile(patchRoot, "masks");
if ~isfolder(imageRoot)
    mkdir(imageRoot);
end
if ~isfolder(maskRoot)
    mkdir(maskRoot);
end

imagePaths = strings(height(trainTbl) * patchesPerImage, 1);
patchMaskPaths = strings(height(trainTbl) * patchesPerImage, 1);
hasLesion = false(height(trainTbl) * patchesPerImage, 1);
row = 0;
for i = 1:height(trainTbl)
    img = read_fundus_rgb(trainTbl.imagePath(i));
    mask = read_native_lesion_mask(maskPaths(i), size(img, [1 2]));
    lesionPixels = find(mask);
    for p = 1:patchesPerImage
        row = row + 1;
        preferPositive = ~isempty(lesionPixels) && (rand() <= positivePatchRatio);
        [imgPatch, maskPatch] = sample_lesion_patch(img, mask, lesionPixels, imageSize(1:2), preferPositive, minPositivePixels);
        patchBase = sprintf("%s_%03d_%03d.png", trainTbl.id(i), i, p);
        imagePaths(row) = fullfile(imageRoot, patchBase);
        patchMaskPaths(row) = fullfile(maskRoot, patchBase);
        hasLesion(row) = nnz(maskPatch) >= minPositivePixels;
        imwrite(imgPatch, imagePaths(row));
        imwrite(maskPatch, patchMaskPaths(row));
    end
end

patchTbl = table(imagePaths, patchMaskPaths, hasLesion, VariableNames=["imagePath", "maskPath", "hasLesion"]);
end

function [imgPatch, maskPatch] = sample_lesion_patch(img, mask, lesionPixels, patchSize, preferPositive, minPositivePixels)
maxAttempts = 10;
bestImgPatch = [];
bestMaskPatch = [];
bestPositivePixels = -1;

for attempt = 1:maxAttempts
    if preferPositive && ~isempty(lesionPixels)
        [centerY, centerX] = ind2sub(size(mask), lesionPixels(randi(numel(lesionPixels))));
        jitter = round((rand(1, 2) - 0.5) .* patchSize * 0.5);
        centerY = centerY + jitter(1);
        centerX = centerX + jitter(2);
    else
        centerY = randi(size(img, 1));
        centerX = randi(size(img, 2));
    end

    [candidateImgPatch, candidateMaskPatch] = crop_patch(img, mask, [centerY centerX], patchSize);
    positivePixels = nnz(candidateMaskPatch);
    if positivePixels > bestPositivePixels
        bestImgPatch = candidateImgPatch;
        bestMaskPatch = candidateMaskPatch;
        bestPositivePixels = positivePixels;
    end
    if ~preferPositive || positivePixels >= minPositivePixels
        imgPatch = candidateImgPatch;
        maskPatch = candidateMaskPatch;
        return;
    end
end

imgPatch = bestImgPatch;
maskPatch = bestMaskPatch;
end

function mask = read_native_lesion_mask(filename, targetSize)
filename = string(filename);
if strlength(filename) == 0 || ~isfile(filename)
    mask = false(targetSize);
    return;
end
mask = imread(filename);
if ~ismatrix(mask)
    mask = mask(:, :, 1);
end
if ~isequal(size(mask, 1), targetSize(1)) || ~isequal(size(mask, 2), targetSize(2))
    mask = imresize(mask, targetSize, "nearest");
end
mask = mask > 0;
end

function [imgPatch, maskPatch] = crop_patch(img, mask, center, patchSize)
halfSize = floor(patchSize / 2);
y1 = center(1) - halfSize(1);
x1 = center(2) - halfSize(2);
y2 = y1 + patchSize(1) - 1;
x2 = x1 + patchSize(2) - 1;

srcY1 = max(1, y1);
srcX1 = max(1, x1);
srcY2 = min(size(img, 1), y2);
srcX2 = min(size(img, 2), x2);
dstY1 = srcY1 - y1 + 1;
dstX1 = srcX1 - x1 + 1;
dstY2 = dstY1 + srcY2 - srcY1;
dstX2 = dstX1 + srcX2 - srcX1;

imgPatch = zeros([patchSize size(img, 3)], "like", img);
maskPatch = false(patchSize);
imgPatch(dstY1:dstY2, dstX1:dstX2, :) = img(srcY1:srcY2, srcX1:srcX2, :);
maskPatch(dstY1:dstY2, dstX1:dstX2) = mask(srcY1:srcY2, srcX1:srcX2);
end

function classWeights = compute_segmentation_class_weights(maskPaths, imageSize, maxClassWeight)
positivePixels = 0;
totalPixels = 0;
for i = 1:numel(maskPaths)
    mask = read_idrid_lesion_mask(maskPaths(i), imageSize);
    positivePixels = positivePixels + nnz(mask);
    totalPixels = totalPixels + numel(mask);
end

negativePixels = totalPixels - positivePixels;
counts = double([negativePixels positivePixels]);
counts = max(counts, 1);
classWeights = sum(counts) ./ (numel(counts) .* counts);
classWeights = classWeights / mean(classWeights);
classWeights = min(classWeights, maxClassWeight);
classWeights = classWeights / mean(classWeights);
end

function loss = combined_lesion_loss(Y, T, classWeights, diceLossWeight)
ceLoss = weighted_segmentation_crossentropy(Y, T, classWeights);
diceLoss = soft_lesion_dice_loss(Y, T);
loss = (1 - diceLossWeight) * ceLoss + diceLossWeight * diceLoss;
end

function loss = weighted_segmentation_crossentropy(Y, T, classWeights)
weights = T .* reshape(single(classWeights), 1, 1, [], 1);
loss = crossentropy(Y, T, weights, ...
    NormalizationFactor="all-elements");
end

function loss = soft_lesion_dice_loss(Y, T)
probabilities = softmax(Y);
lesionScores = probabilities(:, :, 2, :);
lesionTargets = T(:, :, 2, :);
smooth = 1;
intersection = sum(lesionScores .* lesionTargets, "all");
scoreTotal = sum(lesionScores, "all");
targetTotal = sum(lesionTargets, "all");
loss = 1 - (2 * intersection + smooth) / (scoreTotal + targetTotal + smooth);
end
