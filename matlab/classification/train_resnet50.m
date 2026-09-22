function artifacts = train_resnet50(varargin)
%TRAIN_RESNET50 Train ICare DR classifier on APTOS using ResNet-50 transfer learning.
%
% Examples:
%   train_resnet50
%   train_resnet50("quick", true)
%   train_resnet50("pretrained", false)
%   train_resnet50("maxEpochs", 20, "miniBatchSize", 16)
%   train_resnet50("lossMode", "crossentropy")

opts = parse_options(varargin{:});
cfg = icare_config();
tbl = read_aptos_dataset(cfg.dataRoot);

if opts.quick
    rng(opts.seed);
    perClass = splitapply(@(idx) {idx(randperm(numel(idx), min(numel(idx), opts.quickPerClass)))}, ...
        (1:height(tbl))', double(tbl.diagnosis));
    keep = vertcat(perClass{:});
    tbl = tbl(keep, :);
    fprintf("Quick mode enabled: using %d APTOS images.\n", height(tbl));
end

fprintf("APTOS rows available for training: %d\n", height(tbl));
disp(groupsummary(tbl, "diagnosis"));

imageSize = [224 224 3];
classNames = categorical(["0", "1", "2", "3", "4"]);

imds = imageDatastore(tbl.imagePath, Labels=tbl.diagnosis, ReadFcn=@read_fundus_rgb_enhanced);
rng(opts.seed);
[trainDs, restDs] = splitEachLabel(imds, 0.70, "randomized");
[valDs, testDs] = splitEachLabel(restDs, 0.50, "randomized");
classWeights = compute_class_weights(trainDs.Labels, classNames);
disp(table(string(classNames(:)), classWeights(:), VariableNames=["Diagnosis", "ClassWeight"]));

augTrain = augmentedImageDatastore(imageSize, trainDs, ...
    DataAugmentation=imageDataAugmenter( ...
        RandRotation=[-12 12], ...
        RandXReflection=true, ...
        RandScale=[0.90 1.10], ...
        RandXTranslation=[-12 12], ...
        RandYTranslation=[-12 12]));
augVal = augmentedImageDatastore(imageSize, valDs);

try
    if opts.pretrained
        baseNet = resnet50();
    else
        baseNet = resnet50(Weights="none");
        warning("ICare:ResNet50:Untrained", ...
            "Training ResNet-50 from scratch because pretrained=false. This needs more data/epochs and is not transfer learning.");
    end
catch ME
    error("ICare:ResNet50:Unavailable", ...
        "resnet50() pretrained weights are unavailable. Install 'Deep Learning Toolbox Model for ResNet-50 Network' from Add-On Explorer, or run train_resnet50('pretrained', false). Original error: %s", ME.message);
end

lgraph = to_layer_graph(baseNet);
lgraph = replaceLayer(lgraph, "fc1000", fullyConnectedLayer(numel(classNames), Name="icare_dr_fc", WeightLearnRateFactor=10, BiasLearnRateFactor=10));
if opts.lossMode == "ordinal"
    lossLayer = ordinalWeightedClassificationLayer(classNames, classWeights, opts.ordinalPenaltyWeight, "icare_dr_ordinal_classification");
else
    lossLayer = classificationLayer(Name="icare_dr_classification", Classes=classNames, ClassWeights=classWeights);
end
lgraph = replaceLayer(lgraph, "ClassificationLayer_fc1000", lossLayer);

modelRoot = string(cfg.modelRoot);
if ~isfolder(modelRoot)
    mkdir(modelRoot);
end
checkpointDir = fullfile(modelRoot, "checkpoints", "resnet50");
if ~isfolder(checkpointDir)
    mkdir(checkpointDir);
end

options = trainingOptions("sgdm", ...
    InitialLearnRate=opts.initialLearnRate, ...
    LearnRateSchedule="piecewise", ...
    LearnRateDropFactor=opts.learnRateDropFactor, ...
    LearnRateDropPeriod=opts.learnRateDropPeriod, ...
    Momentum=opts.momentum, ...
    L2Regularization=opts.l2Regularization, ...
    MaxEpochs=opts.maxEpochs, ...
    MiniBatchSize=opts.miniBatchSize, ...
    Shuffle="every-epoch", ...
    ValidationData=augVal, ...
    ValidationFrequency=max(1, floor(numel(trainDs.Files) / opts.miniBatchSize)), ...
    ValidationPatience=opts.validationPatience, ...
    OutputNetwork="best-validation-loss", ...
    CheckpointPath=checkpointDir, ...
    Verbose=true, ...
    Plots=opts.plots, ...
    ExecutionEnvironment=opts.executionEnvironment);

fprintf("Starting ICare ResNet-50 training. This can take a while.\n");
[net, trainInfo] = trainNetwork(augTrain, lgraph, options);

evalDs = imageDatastore(testDs.Files, Labels=testDs.Labels, ReadFcn=@(filename) read_fundus_for_network_enhanced(filename, imageSize));
metrics = evaluate_classification(net, evalDs, evalDs.Labels, classNames);
calibrationDs = imageDatastore(valDs.Files, Labels=valDs.Labels, ReadFcn=@(filename) read_fundus_for_network_enhanced(filename, imageSize));
confidenceCalibration = calibrate_classification_confidence(net, calibrationDs, calibrationDs.Labels, classNames);

timestamp = string(datetime("now", Format="yyyyMMdd_HHmmss"));
artifactPath = fullfile(modelRoot, "resnet50_dr_" + timestamp + ".mat");
if opts.quick
    latestPath = fullfile(modelRoot, "resnet50_dr_quick.mat");
elseif ~opts.updateDeployment
    latestPath = fullfile(modelRoot, "resnet50_dr_" + opts.lossMode + "_ablation.mat");
else
    latestPath = fullfile(modelRoot, "resnet50_dr.mat");
end
metricsPath = fullfile(modelRoot, "resnet50_dr_metrics_" + timestamp + ".mat");

modelVersion = "resnet50-aptos-" + timestamp;
datasetSummary = struct();
datasetSummary.source = "APTOS 2019";
datasetSummary.dataRoot = string(cfg.dataRoot);
datasetSummary.totalRows = height(tbl);
datasetSummary.trainCount = numel(trainDs.Files);
datasetSummary.validationCount = numel(valDs.Files);
datasetSummary.testCount = numel(testDs.Files);
datasetSummary.classNames = cellstr(classNames);
datasetSummary.classWeights = classWeights;
datasetSummary.lossMode = opts.lossMode;
datasetSummary.ordinalPenaltyWeight = opts.ordinalPenaltyWeight;
datasetSummary.updateDeployment = opts.updateDeployment;
datasetSummary.quickMode = opts.quick;
datasetSummary.note = "APTOS labels are imbalanced and ordinal; ICare uses inverse-frequency class weights and an ordinal distance penalty by default.";

save(artifactPath, "net", "trainInfo", "metrics", "confidenceCalibration", "modelVersion", "cfg", "datasetSummary", "-v7.3");
save(latestPath, "net", "trainInfo", "metrics", "confidenceCalibration", "modelVersion", "cfg", "datasetSummary", "-v7.3");
save(metricsPath, "metrics");

artifacts = struct();
artifacts.modelVersion = modelVersion;
artifacts.modelPath = artifactPath;
artifacts.latestModelPath = latestPath;
artifacts.metricsPath = metricsPath;
artifacts.metrics = metrics;
artifacts.confidenceCalibration = confidenceCalibration;

fprintf("Saved ICare ResNet-50 model: %s\n", artifactPath);
fprintf("Test accuracy: %.4f, macro F1: %.4f\n", metrics.accuracy, metrics.macroF1);
end

function opts = parse_options(varargin)
parser = inputParser;
addParameter(parser, "quick", false, @(x) islogical(x) || isnumeric(x));
addParameter(parser, "pretrained", true, @(x) islogical(x) || isnumeric(x));
addParameter(parser, "quickPerClass", 30, @(x) isnumeric(x) && x > 0);
addParameter(parser, "maxEpochs", 20, @(x) isnumeric(x) && x > 0);
addParameter(parser, "miniBatchSize", 16, @(x) isnumeric(x) && x > 0);
addParameter(parser, "initialLearnRate", 1e-4, @(x) isnumeric(x) && x > 0);
addParameter(parser, "learnRateDropFactor", 0.2, @(x) isnumeric(x) && x > 0 && x < 1);
addParameter(parser, "learnRateDropPeriod", 3, @(x) isnumeric(x) && x > 0);
addParameter(parser, "momentum", 0.9, @(x) isnumeric(x) && x > 0 && x < 1);
addParameter(parser, "l2Regularization", 1e-4, @(x) isnumeric(x) && x >= 0);
addParameter(parser, "validationPatience", 8, @(x) isnumeric(x) && x > 0);
addParameter(parser, "lossMode", "ordinal", @(x) ismember(string(x), ["ordinal", "crossentropy"]));
addParameter(parser, "ordinalPenaltyWeight", 0.35, @(x) isnumeric(x) && x >= 0);
addParameter(parser, "updateDeployment", true, @(x) islogical(x) || isnumeric(x));
addParameter(parser, "executionEnvironment", "auto", @(x) ismember(string(x), ["auto", "cpu", "gpu", "multi-gpu", "parallel"]));
addParameter(parser, "plots", "training-progress", @(x) ismember(string(x), ["none", "training-progress"]));
addParameter(parser, "seed", 26038, @(x) isnumeric(x));
parse(parser, varargin{:});
opts = parser.Results;
opts.quick = logical(opts.quick);
opts.pretrained = logical(opts.pretrained);
opts.lossMode = string(opts.lossMode);
opts.ordinalPenaltyWeight = double(opts.ordinalPenaltyWeight);
opts.updateDeployment = logical(opts.updateDeployment);
end

function classWeights = compute_class_weights(labels, classNames)
counts = countcats(categorical(labels, classNames));
counts = double(counts(:));
if any(counts == 0)
    error("ICare:APTOS:MissingClass", "Training split is missing at least one diagnosis class. Use a larger split or disable quick mode.");
end
classWeights = sum(counts) ./ (numel(counts) .* counts);
classWeights = classWeights / mean(classWeights);
end

function lgraph = to_layer_graph(baseNet)
if isa(baseNet, "nnet.cnn.LayerGraph")
    lgraph = baseNet;
else
    lgraph = layerGraph(baseNet);
end
end
