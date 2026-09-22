function [statusCode, predictedGrade, confidence, reviewFlag, vesselFraction, hardExudateFraction, microaneurysmFraction, haemorrhageFraction, softExudateFraction] = icare_simulink_predict(imagePath)
%ICARE_SIMULINK_PREDICT Simulink-friendly ICare inference outputs.
%   This wrapper is intended for normal Simulink simulation through a
%   MATLAB Function block with coder.extrinsic. It returns plain doubles so
%   the demo model can connect the outputs directly to Display blocks.
addpath(genpath(fullfile(fileparts(mfilename("fullpath")), "..")));

statusCode = 0;
predictedGrade = -1;
confidence = 0;
reviewFlag = 1;
vesselFraction = NaN;
hardExudateFraction = NaN;
microaneurysmFraction = NaN;
haemorrhageFraction = NaN;
softExudateFraction = NaN;

try
    result = run_inference(string(imagePath));
    if result.status ~= "completed"
        return;
    end

    statusCode = 1;
    predictedGrade = double(result.classification.primary.predictedGrade);
    confidence = double(result.classification.primary.confidence);
    reviewFlag = double(result.safety.requiresClinicalReview);

    vesselFraction = foreground_fraction(result.segmentation.vessels);
    hardExudateFraction = foreground_fraction(result.segmentation.hardExudates);
    microaneurysmFraction = foreground_fraction(result.segmentation.microaneurysms);
    haemorrhageFraction = foreground_fraction(result.segmentation.haemorrhages);
    softExudateFraction = foreground_fraction(result.segmentation.softExudates);
catch ME
    warning("ICare:Simulink:InferenceFailed", "%s", ME.message);
end
end

function value = foreground_fraction(item)
value = NaN;
if isstruct(item) && isfield(item, "available") && item.available && isfield(item, "foregroundFraction")
    value = double(item.foregroundFraction);
end
end
