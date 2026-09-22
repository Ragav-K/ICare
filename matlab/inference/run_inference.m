function result = run_inference(imagePath)
addpath(genpath(fullfile(fileparts(mfilename("fullpath")), "..")));
cfg = icare_config();
quality = quality_check(imagePath);

result = struct();
result.status = "failed";
result.modelVersion = cfg.modelVersion;
result.quality = quality;

if ~quality.acceptable
    result.error = "IMAGE_QUALITY_INSUFFICIENT";
    result.message = "Needs recapture. ICare does not run diagnosis on unusable images.";
    return;
end

resnetPath = fullfile(cfg.modelRoot, "resnet50_dr.mat");
mobilenetPath = fullfile(cfg.modelRoot, "mobilenetv2_dr.mat");
if ~isfile(resnetPath) && ~isfile(mobilenetPath)
    result.error = "TRAINED_MODEL_UNAVAILABLE";
    result.message = "Training not completed - no validated metric or inference result available.";
    return;
end

result.status = "completed";
result.message = "ICare MATLAB inference completed with available trained artifacts.";
result.classification = struct();
result.classification.resnet50 = classify_dr_model(resnetPath, imagePath, "ResNet-50");
result.classification.mobilenetv2 = classify_dr_model(mobilenetPath, imagePath, "MobileNetV2");
result.classification.primaryModel = "ResNet-50";
result.classification.primary = result.classification.resnet50;

result.segmentation = struct();
result.segmentation.vessels = segment_binary_model(fullfile(cfg.modelRoot, "unet_vessels_drive.mat"), imagePath, "U-Net DRIVE vessels", "vessel");
result.segmentation.hardExudates = segment_binary_model(fullfile(cfg.modelRoot, "unet_lesions_hard_exudates.mat"), imagePath, "U-Net IDRiD hard exudates", "lesion");
result.segmentation.microaneurysms = segment_binary_model(fullfile(cfg.modelRoot, "unet_lesions_microaneurysms.mat"), imagePath, "U-Net IDRiD microaneurysms", "lesion");
result.segmentation.haemorrhages = segment_binary_model(fullfile(cfg.modelRoot, "unet_lesions_haemorrhages.mat"), imagePath, "U-Net IDRiD haemorrhages", "lesion");
result.segmentation.softExudates = segment_binary_model(fullfile(cfg.modelRoot, "unet_lesions_soft_exudates.mat"), imagePath, "U-Net IDRiD soft exudates", "lesion");

result.safety = struct();
result.safety.systemRole = "AI-assisted screening and decision support";
result.safety.notDiagnosis = true;
result.safety.requiresClinicalReview = result.classification.primary.predictedGrade >= 2 || result.classification.primary.confidence < 0.50;
result.generatedAt = string(datetime("now", TimeZone="local", Format="yyyy-MM-dd HH:mm:ss Z"));
end
