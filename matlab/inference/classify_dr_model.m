function output = classify_dr_model(modelPath, imagePath, modelName)
output = struct();
output.modelName = string(modelName);
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

img = read_fundus_for_network(imagePath, [224 224 3]);
[label, scores] = classify(artifact.net, img);
[rawConfidence, idx] = max(scores);
confidence = calibrate_confidence(rawConfidence, artifact);

output.available = true;
output.status = "completed";
output.predictedGrade = str2double(string(label));
output.predictedLabel = string(label);
output.confidence = double(confidence);
output.rawConfidence = double(rawConfidence);
output.confidenceCalibration = describe_calibration(artifact);
output.classScores = scores_to_struct(scores);
output.modelVersion = get_optional_string(artifact, "modelVersion", modelName);
output.metrics = summarize_metrics(artifact);
output.severity = dr_grade_to_severity(output.predictedGrade);
output.risk = dr_grade_to_risk(output.predictedGrade, output.confidence);
output.winningClassIndex = idx;
explanation = generate_gradcam(artifact.net, img, imagePath, modelName, idx);
output.gradCamStatus = explanation.status;
if explanation.status == "completed"
    output.gradCamPath = explanation.imagePath;
    output.gradCamNote = explanation.note;
else
    output.gradCamNote = explanation.reason;
end
end

function confidence = calibrate_confidence(rawConfidence, artifact)
confidence = rawConfidence;
if ~isfield(artifact, "confidenceCalibration")
    return;
end
cal = artifact.confidenceCalibration;
if ~isfield(cal, "binEdges") || ~isfield(cal, "filledAccuracy")
    return;
end
edges = double(cal.binEdges);
values = double(cal.filledAccuracy);
binIdx = find(rawConfidence >= edges(1:end-1) & rawConfidence < edges(2:end), 1, "first");
if isempty(binIdx) && rawConfidence == 1
    binIdx = numel(values);
end
if ~isempty(binIdx) && binIdx <= numel(values) && ~isnan(values(binIdx))
    confidence = values(binIdx);
end
end

function summary = describe_calibration(artifact)
summary = struct();
summary.available = false;
if ~isfield(artifact, "confidenceCalibration")
    return;
end
cal = artifact.confidenceCalibration;
summary.available = true;
summary.method = get_optional_string(cal, "method", "unknown");
if isfield(cal, "validationAccuracy")
    summary.validationAccuracy = double(cal.validationAccuracy);
end
if isfield(cal, "expectedCalibrationError")
    summary.expectedCalibrationError = double(cal.expectedCalibrationError);
end
if isfield(cal, "generatedAt")
    summary.generatedAt = string(cal.generatedAt);
end
end

function scoresStruct = scores_to_struct(scores)
scoresStruct = struct();
for i = 1:numel(scores)
    scoresStruct.("grade" + string(i - 1)) = double(scores(i));
end
end

function value = get_optional_string(artifact, fieldName, fallback)
if isfield(artifact, fieldName)
    value = string(artifact.(fieldName));
else
    value = string(fallback);
end
end

function metricsOut = summarize_metrics(artifact)
metricsOut = struct();
if isfield(artifact, "metrics")
    metricsOut.accuracy = get_metric_or_nan(artifact.metrics, "accuracy");
    metricsOut.macroF1 = get_metric_or_nan(artifact.metrics, "macroF1");
end
end

function value = get_metric_or_nan(metrics, fieldName)
if isfield(metrics, fieldName)
    value = double(metrics.(fieldName));
else
    value = NaN;
end
end

function severity = dr_grade_to_severity(grade)
switch grade
    case 0
        severity = "No apparent DR";
    case 1
        severity = "Mild DR";
    case 2
        severity = "Moderate DR";
    case 3
        severity = "Severe DR";
    case 4
        severity = "Proliferative DR";
    otherwise
        severity = "Unknown";
end
end

function risk = dr_grade_to_risk(grade, confidence)
if confidence < 0.50
    risk = "doctor_review_low_confidence";
elseif grade >= 3
    risk = "urgent_referral";
elseif grade == 2
    risk = "routine_referral";
else
    risk = "monitor";
end
end
