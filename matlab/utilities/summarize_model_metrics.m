function summary = summarize_model_metrics(modelRoot)
%SUMMARIZE_MODEL_METRICS Print the latest ICare model metrics in one table.
if nargin < 1 || strlength(string(modelRoot)) == 0
    cfg = icare_config();
    modelRoot = cfg.modelRoot;
end

modelRoot = string(modelRoot);
if ~isfolder(modelRoot)
    error("ICare:Models:MissingFolder", "Model folder not found: %s", modelRoot);
end

patterns = [
    "resnet50_dr_metrics_*.mat"
    "mobilenetv2_dr_metrics_*.mat"
    "unet_vessels_drive_metrics_*.mat"
    "unet_lesions_microaneurysms_metrics_*.mat"
    "unet_lesions_haemorrhages_metrics_*.mat"
    "unet_lesions_soft_exudates_metrics_*.mat"
    "unet_lesions_hard_exudates_metrics_*.mat"
];

modelNames = [
    "ResNet-50 DR"
    "MobileNetV2 DR"
    "U-Net Vessels"
    "U-Net Microaneurysms"
    "U-Net Haemorrhages"
    "U-Net Soft Exudates"
    "U-Net Hard Exudates"
];

tasks = [
    "classification"
    "classification"
    "segmentation"
    "segmentation"
    "segmentation"
    "segmentation"
    "segmentation"
];

rows = table('Size', [0 8], ...
    'VariableTypes', ["string", "string", "double", "double", "double", "double", "double", "string"], ...
    'VariableNames', ["Model", "Task", "Accuracy", "MacroF1", "MeanDice", "MeanIoU", "Threshold", "MetricsFile"]);

for i = 1:numel(patterns)
    latestFile = find_latest_file(modelRoot, patterns(i));
    if strlength(latestFile) == 0
        rows = [rows; {modelNames(i), tasks(i), NaN, NaN, NaN, NaN, NaN, ""}]; %#ok<AGROW>
        continue;
    end

    loaded = load(latestFile);
    metrics = loaded.metrics;
    rows = [rows; { ...
        modelNames(i), ...
        tasks(i), ...
        metric_or_nan(metrics, "accuracy"), ...
        metric_or_nan(metrics, "macroF1"), ...
        metric_or_nan(metrics, "meanDice"), ...
        metric_or_nan(metrics, "meanIoU"), ...
        metric_or_nan(metrics, "optimalThreshold"), ...
        string(latestFile)}]; %#ok<AGROW>
end

summary = rows;
disp(summary);
end

function latestFile = find_latest_file(modelRoot, pattern)
files = dir(fullfile(modelRoot, pattern));
if isempty(files)
    latestFile = "";
    return;
end
[~, idx] = max([files.datenum]);
latestFile = string(fullfile(files(idx).folder, files(idx).name));
end

function value = metric_or_nan(metrics, fieldName)
if isfield(metrics, fieldName)
    value = double(metrics.(fieldName));
else
    value = NaN;
end
end
