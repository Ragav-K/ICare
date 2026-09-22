function output = segment_binary_model(modelPath, imagePath, modelName, modelKind)
output = struct();
output.modelName = string(modelName);
output.modelKind = string(modelKind);
output.modelPath = string(modelPath);
output.available = false;

if ~isfile(modelPath)
    output.status = "unavailable";
    output.reason = "model artifact not found";
    return;
end

artifact = load(modelPath);
if ~isfield(artifact, "net")
    output.status = "failed";
    output.reason = "model artifact does not contain net";
    return;
end

imageSize = [256 256 3];
if modelKind == "vessel"
    img = read_drive_image_for_network(imagePath, imageSize);
    threshold = get_segmentation_threshold(artifact, modelKind);
    mask = predict_binary_mask(artifact.net, img, threshold);
else
    img = read_fundus_rgb(imagePath);
    threshold = get_segmentation_threshold(artifact, modelKind);
    mask = predict_binary_mask_tiled(artifact.net, img, imageSize, threshold);
end

visuals = write_segmentation_visuals(img, mask, imagePath, modelKind, modelName);

output.available = true;
output.status = "completed";
output.modelVersion = get_optional_string(artifact, "modelVersion", modelName);
output.threshold = threshold;
output.foregroundPixelCount = nnz(mask);
output.foregroundFraction = double(nnz(mask)) / double(numel(mask));
output.maskPath = visuals.maskPath;
output.overlayPath = visuals.overlayPath;
output.metrics = summarize_segmentation_metrics(artifact);
output.note = segmentation_note(modelName, artifact);
if modelKind == "lesion"
    output.inferenceMode = "native-resolution tiled";
    output.tileSize = imageSize(1:2);
    output.tileStride = imageSize(1);
else
    output.inferenceMode = "single resized image";
end
end

function mask = predict_binary_mask(net, img, threshold)
try
    scores = minibatchpredict(net, single(img));
    if size(scores, 3) >= 2
        mask = foreground_probability(scores) >= threshold;
    else
        mask = scores(:, :, 1) > 0.5;
    end
catch
    labels = semanticseg(img, net, Classes=["background", "lesion"]);
    mask = labels ~= "background";
end
end

function mask = predict_binary_mask_tiled(net, img, imageSize, threshold)
tileSize = imageSize(1:2);
stride = tileSize(1);
imgSize = size(img, [1 2]);
yStarts = tile_starts(imgSize(1), tileSize(1), stride);
xStarts = tile_starts(imgSize(2), tileSize(2), stride);
probabilitySum = zeros(imgSize, "single");
voteCount = zeros(imgSize, "single");

for y = yStarts
    for x = xStarts
        [tile, bounds] = crop_tile(img, [y x], tileSize);
        tileProbability = predict_binary_probability(net, tile);
        targetRows = bounds.srcY1:bounds.srcY2;
        targetCols = bounds.srcX1:bounds.srcX2;
        tileRows = bounds.dstY1:bounds.dstY2;
        tileCols = bounds.dstX1:bounds.dstX2;
        probabilitySum(targetRows, targetCols) = probabilitySum(targetRows, targetCols) + single(tileProbability(tileRows, tileCols));
        voteCount(targetRows, targetCols) = voteCount(targetRows, targetCols) + 1;
    end
end

voteCount(voteCount == 0) = 1;
mask = (probabilitySum ./ voteCount) >= threshold;
end

function probability = predict_binary_probability(net, img)
try
    scores = minibatchpredict(net, single(img));
catch
    labels = semanticseg(img, net, Classes=["background", "lesion"]);
    probability = double(labels ~= "background");
    return;
end
if size(scores, 3) < 2
    error("ICare:Segmentation:UnexpectedOutputChannels", ...
        "Expected at least two segmentation channels, got %d.", size(scores, 3));
end
probability = foreground_probability(scores);
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

function threshold = get_segmentation_threshold(artifact, modelKind)
threshold = 0.5;
if ismember(modelKind, ["lesion", "vessel"]) && isfield(artifact, "metrics") && isfield(artifact.metrics, "optimalThreshold")
    threshold = double(artifact.metrics.optimalThreshold);
end
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

function visuals = write_segmentation_visuals(img, mask, imagePath, modelKind, modelName)
cfg = icare_config();
outputRoot = fullfile(string(cfg.modelRoot), "inference_outputs");
if ~isfolder(outputRoot)
    mkdir(outputRoot);
end

[~, imageStem] = fileparts(imagePath);
modelStem = lower(regexprep(string(modelName), "[^a-zA-Z0-9]+", "_"));
timestamp = string(datetime("now", Format="yyyyMMdd_HHmmss"));
baseName = imageStem + "_" + modelStem + "_" + timestamp;

maskPath = fullfile(outputRoot, baseName + "_mask.png");
overlayPath = fullfile(outputRoot, baseName + "_overlay.png");

imgUint8 = im2uint8(img);
mask = logical(mask);
imwrite(mask, maskPath);
imwrite(make_overlay(imgUint8, mask, modelKind), overlayPath);

visuals = struct();
visuals.maskPath = string(maskPath);
visuals.overlayPath = string(overlayPath);
end

function overlay = make_overlay(img, mask, modelKind)
overlay = im2double(img);
color = overlay_color(modelKind);
alpha = 0.45;
for c = 1:3
    channel = overlay(:, :, c);
    channel(mask) = (1 - alpha) * channel(mask) + alpha * color(c);
    overlay(:, :, c) = channel;
end
overlay = im2uint8(overlay);
end

function color = overlay_color(modelKind)
if modelKind == "vessel"
    color = [0.00 0.75 1.00];
else
    color = [1.00 0.20 0.10];
end
end

function value = get_optional_string(artifact, fieldName, fallback)
if isfield(artifact, fieldName)
    value = string(artifact.(fieldName));
else
    value = string(fallback);
end
end

function metricsOut = summarize_segmentation_metrics(artifact)
metricsOut = struct();
if isfield(artifact, "metrics")
    metricsOut.meanDice = get_metric_or_nan(artifact.metrics, "meanDice");
    metricsOut.meanIoU = get_metric_or_nan(artifact.metrics, "meanIoU");
end
end

function value = get_metric_or_nan(metrics, fieldName)
if isfield(metrics, fieldName)
    value = double(metrics.(fieldName));
else
    value = NaN;
end
end

function note = segmentation_note(modelName, artifact)
note = "baseline segmentation output";
if contains(lower(string(modelName)), ["microaneurysm", "haemorrhage", "soft"])
    note = "weak baseline from sparse-lesion training; use for pipeline demonstration only";
end
if isfield(artifact, "metrics") && isfield(artifact.metrics, "meanDice") && artifact.metrics.meanDice < 0.05
    note = "very weak validation Dice; do not use as reliable lesion localization";
end
end
