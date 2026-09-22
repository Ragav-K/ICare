function result = demo_inference_report(imagePath)
%DEMO_INFERENCE_REPORT Run ICare inference and print a compact report.
addpath(genpath(fullfile(fileparts(mfilename("fullpath")), "..")));

if nargin < 1 || strlength(string(imagePath)) == 0
    imagePath = find_default_demo_image();
end

imagePath = string(imagePath);
if ~isfile(imagePath)
    error("ICare:Demo:MissingImage", "Demo image not found: %s", imagePath);
end

result = run_inference(imagePath);
print_report(result, imagePath);
end

function imagePath = find_default_demo_image()
cfg = icare_config();
aptosTbl = read_aptos_dataset(cfg.dataRoot);
if isempty(aptosTbl)
    error("ICare:Demo:NoImages", "No APTOS images found for the default demo.");
end
imagePath = aptosTbl.imagePath(1);
end

function print_report(result, imagePath)
fprintf("\nICare Inference Report\n");
fprintf("Image: %s\n", imagePath);
fprintf("Status: %s\n", result.status);

fprintf("\nQuality\n");
fprintf("Acceptable: %s\n", string(result.quality.acceptable));
fprintf("Blur score: %.4f | Brightness: %.4f | Contrast: %.4f\n", ...
    result.quality.blurScore, result.quality.brightness, result.quality.contrast);
if ~isempty(result.quality.guidance)
    fprintf("Guidance: %s\n", strjoin(string(result.quality.guidance), ", "));
end

if result.status ~= "completed"
    fprintf("\nMessage: %s\n", result.message);
    return;
end

primary = result.classification.primary;
fprintf("\nClassification\n");
fprintf("Primary model: %s\n", result.classification.primaryModel);
fprintf("Predicted grade: %d (%s)\n", primary.predictedGrade, primary.severity);
fprintf("Confidence: %.2f%%\n", 100 * primary.confidence);
fprintf("Risk flag: %s\n", primary.risk);
if isfield(primary, "metrics")
    fprintf("Model accuracy: %.2f%% | Macro F1: %.4f\n", ...
        100 * primary.metrics.accuracy, primary.metrics.macroF1);
end

fprintf("\nSegmentation\n");
print_segmentation_line("Vessels", result.segmentation.vessels);
print_segmentation_line("Hard exudates", result.segmentation.hardExudates);
print_segmentation_line("Microaneurysms", result.segmentation.microaneurysms);
print_segmentation_line("Haemorrhages", result.segmentation.haemorrhages);
print_segmentation_line("Soft exudates", result.segmentation.softExudates);

fprintf("\nClinical safety\n");
fprintf("AI-assisted screening only: %s\n", string(result.safety.notDiagnosis));
fprintf("Requires clinical review: %s\n", string(result.safety.requiresClinicalReview));
fprintf("Generated: %s\n\n", result.generatedAt);
end

function print_segmentation_line(label, item)
if ~item.available
    fprintf("%s: unavailable (%s)\n", label, item.reason);
    return;
end

thresholdText = "";
if isfield(item, "threshold") && ~isnan(item.threshold)
    thresholdText = sprintf(" | threshold %.2f", item.threshold);
end

fprintf("%s: %.4f foreground fraction%s", label, item.foregroundFraction, thresholdText);
if isfield(item, "metrics") && isfield(item.metrics, "meanDice")
    fprintf(" | Dice %.4f | IoU %.4f", item.metrics.meanDice, item.metrics.meanIoU);
end
fprintf("\n");
if isfield(item, "overlayPath")
    fprintf("  Overlay: %s\n", item.overlayPath);
end
if isfield(item, "maskPath")
    fprintf("  Mask: %s\n", item.maskPath);
end
end
