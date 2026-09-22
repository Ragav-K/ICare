function artifacts = train_unet_vessels(varargin)
%TRAIN_UNET_VESSELS Train ICare U-Net vessel segmentation on DRIVE.
%
% DRIVE test has field-of-view masks, not vessel ground-truth masks in this
% dataset copy, so validation/test metrics are computed from a held-out split
% of the labeled training images.
%
% Examples:
%   train_unet_vessels("quick", true)
%   train_unet_vessels("maxEpochs", 20, "miniBatchSize", 2)

opts = parse_options(varargin{:});
cfg = icare_config();
tbl = read_drive_vessel_dataset(cfg.dataRoot);
fprintf("DRIVE labeled vessel images available: %d\n", height(tbl));

imageSize = [256 256 3];
classNames = ["background", "vessel"];
labelIDs = [0 1];

rng(opts.seed);
order = randperm(height(tbl));
if opts.quick
    order = order(1:min(numel(order), opts.quickCount));
    fprintf("Quick mode enabled: using %d DRIVE images.\n", numel(order));
end
tbl = tbl(order, :);

splitIndex = max(1, floor(0.80 * height(tbl)));
trainTbl = tbl(1:splitIndex, :);
valTbl = tbl(splitIndex + 1:end, :);
if height(valTbl) == 0
    valTbl = trainTbl(end, :);
end

imdsTrain = imageDatastore(cellstr(trainTbl.imagePath), ReadFcn=@(filename) read_drive_image_for_network(filename, imageSize));
pxdsTrain = pixelLabelDatastore(cellstr(trainTbl.maskPath), classNames, labelIDs, ReadFcn=@(filename) read_drive_vessel_mask(filename, imageSize));
dsTrain = combine(imdsTrain, pxdsTrain);

imdsVal = imageDatastore(cellstr(valTbl.imagePath), ReadFcn=@(filename) read_drive_image_for_network(filename, imageSize));
pxdsVal = pixelLabelDatastore(cellstr(valTbl.maskPath), classNames, labelIDs, ReadFcn=@(filename) read_drive_vessel_mask(filename, imageSize));
dsVal = combine(imdsVal, pxdsVal);

try
    unetNet = unet(imageSize, numel(classNames), EncoderDepth=opts.encoderDepth);
catch ME
    error("ICare:UNet:Unavailable", ...
        "unet is unavailable. Install/enable Computer Vision Toolbox and Deep Learning Toolbox. Original error: %s", ME.message);
end

modelRoot = string(cfg.modelRoot);
if ~isfolder(modelRoot)
    mkdir(modelRoot);
end
checkpointDir = fullfile(modelRoot, "checkpoints", "unet_vessels");
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
    ValidationFrequency=max(1, floor(height(trainTbl) / opts.miniBatchSize)), ...
    ValidationPatience=opts.validationPatience, ...
    OutputNetwork="best-validation-loss", ...
    CheckpointPath=checkpointDir, ...
    Verbose=true, ...
    Plots=opts.plots, ...
    ExecutionEnvironment=opts.executionEnvironment);

fprintf("Starting ICare U-Net DRIVE vessel training.\n");
[net, trainInfo] = trainnet(dsTrain, unetNet, "crossentropy", options);

metrics = evaluate_vessel_segmentation(net, valTbl, imageSize, classNames, opts.thresholds);

timestamp = string(datetime("now", Format="yyyyMMdd_HHmmss"));
artifactPath = fullfile(modelRoot, "unet_vessels_drive_" + timestamp + ".mat");
if opts.quick
    latestPath = fullfile(modelRoot, "unet_vessels_drive_quick.mat");
else
    latestPath = fullfile(modelRoot, "unet_vessels_drive.mat");
end
metricsPath = fullfile(modelRoot, "unet_vessels_drive_metrics_" + timestamp + ".mat");

modelVersion = "unet-vessels-drive-" + timestamp;
datasetSummary = struct();
datasetSummary.source = "DRIVE";
datasetSummary.dataRoot = string(cfg.dataRoot);
datasetSummary.totalLabeledImages = height(tbl);
datasetSummary.trainCount = height(trainTbl);
datasetSummary.validationCount = height(valTbl);
datasetSummary.quickMode = opts.quick;
datasetSummary.thresholds = opts.thresholds;
datasetSummary.note = "Metrics use held-out labeled DRIVE training images because this dataset copy has no vessel ground truth in DRIVE/test.";

save(artifactPath, "net", "trainInfo", "metrics", "modelVersion", "cfg", "datasetSummary", "-v7.3");
save(latestPath, "net", "trainInfo", "metrics", "modelVersion", "cfg", "datasetSummary", "-v7.3");
save(metricsPath, "metrics");

artifacts = struct();
artifacts.modelVersion = modelVersion;
artifacts.modelPath = artifactPath;
artifacts.latestModelPath = latestPath;
artifacts.metricsPath = metricsPath;
artifacts.metrics = metrics;

fprintf("Saved ICare U-Net vessel model: %s\n", artifactPath);
fprintf("Validation Dice: %.4f, IoU: %.4f\n", metrics.meanDice, metrics.meanIoU);
end

function metrics = evaluate_vessel_segmentation(net, valTbl, imageSize, classNames, thresholds)
scoreMaps = cell(height(valTbl), 1);
actualMasks = cell(height(valTbl), 1);

for i = 1:height(valTbl)
    img = read_drive_image_for_network(valTbl.imagePath(i), imageSize);
    actualMasks{i} = read_drive_vessel_mask(valTbl.maskPath(i), imageSize);
    predictedScores = minibatchpredict(net, single(img));
    if size(predictedScores, 3) == 2
        scoreMaps{i} = foreground_probability(predictedScores);
    else
        predictedLabels = semanticseg(img, net, Classes=classNames);
        scoreMaps{i} = double(predictedLabels == "vessel");
    end
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
metrics.evaluatedAt = string(datetime("now", TimeZone="local", Format="yyyy-MM-dd HH:mm:ss Z"));
end

function probabilities = foreground_probability(scores)
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

function opts = parse_options(varargin)
parser = inputParser;
addParameter(parser, "quick", false, @(x) islogical(x) || isnumeric(x));
addParameter(parser, "quickCount", 6, @(x) isnumeric(x) && x > 1);
addParameter(parser, "maxEpochs", 20, @(x) isnumeric(x) && x > 0);
addParameter(parser, "miniBatchSize", 2, @(x) isnumeric(x) && x > 0);
addParameter(parser, "initialLearnRate", 1e-3, @(x) isnumeric(x) && x > 0);
addParameter(parser, "learnRateDropFactor", 0.5, @(x) isnumeric(x) && x > 0 && x < 1);
addParameter(parser, "learnRateDropPeriod", 8, @(x) isnumeric(x) && x > 0);
addParameter(parser, "l2Regularization", 1e-4, @(x) isnumeric(x) && x >= 0);
addParameter(parser, "validationPatience", 6, @(x) isnumeric(x) && x > 0);
addParameter(parser, "encoderDepth", 3, @(x) isnumeric(x) && x >= 2);
addParameter(parser, "thresholds", 0.05:0.05:0.95, @(x) isnumeric(x) && all(x > 0) && all(x < 1));
addParameter(parser, "executionEnvironment", "auto", @(x) ismember(string(x), ["auto", "cpu", "gpu", "multi-gpu", "parallel"]));
addParameter(parser, "plots", "training-progress", @(x) ismember(string(x), ["none", "training-progress"]));
addParameter(parser, "seed", 26038, @(x) isnumeric(x));
parse(parser, varargin{:});
opts = parser.Results;
opts.quick = logical(opts.quick);
opts.thresholds = double(opts.thresholds(:)');
end
