function results = evaluate_messidor2_external(modelName, options)
%EVALUATE_MESSIDOR2_EXTERNAL Score a trained DR classifier against Messidor-2.
%   modelName must be "resnet50" or "mobilenetv2".
%   Messidor-2 is held out entirely from training/calibration and used only
%   here, so these numbers are a genuine external-validation check.
%
%   Example:
%       results = evaluate_messidor2_external("resnet50");
%       results = evaluate_messidor2_external("resnet50", Enhanced=true);
%
%   Enhanced=true reads images through read_fundus_for_network_enhanced
%   (CLAHE illumination harmonization) instead of the raw resize used at
%   training time, to probe how much of any domain gap is a preprocessing
%   mismatch versus a deeper representation gap. Note the model was
%   trained on raw-read images, so this is a test-time-only mismatch
%   experiment, not a like-for-like retrained comparison.

arguments
    modelName
    options.Enhanced (1,1) logical = false
end

cfg = icare_config();
imageSize = [224 224 3];
classNames = categorical(["0", "1", "2", "3", "4"]);

modelName = lower(string(modelName));
switch modelName
    case "resnet50"
        modelPath = fullfile(cfg.modelRoot, "resnet50_dr.mat");
    case "mobilenetv2"
        modelPath = fullfile(cfg.modelRoot, "mobilenetv2_dr.mat");
    otherwise
        error("ICare:Messidor2Eval:UnknownModel", "modelName must be resnet50 or mobilenetv2.");
end

if ~isfile(modelPath)
    error("ICare:Messidor2Eval:MissingModel", "Model artifact not found: %s", modelPath);
end

artifact = load(modelPath);
if ~isfield(artifact, "net")
    error("ICare:Messidor2Eval:InvalidArtifact", "Model artifact does not contain net: %s", modelPath);
end

tbl = read_messidor2_dataset(cfg.dataRoot);
if isempty(tbl)
    error("ICare:Messidor2Eval:NoImages", "No gradable Messidor-2 images found.");
end

if options.Enhanced
    readFcn = @(filename) read_fundus_for_network_enhanced(filename, imageSize);
else
    readFcn = @(filename) read_fundus_for_network(filename, imageSize);
end
imds = imageDatastore(tbl.imagePath, Labels=tbl.diagnosis, ReadFcn=readFcn);

metrics = evaluate_classification(artifact.net, imds, imds.Labels, classNames);

% Referable DR (International Clinical DR scale, Level 2+) collapses the
% 5-way grade into a clinical accept/refer decision, which is the metric
% the problem statement's >90% sensitivity / >85% specificity target is
% defined against.
actualReferable = double(string(imds.Labels)) >= 2;
predictedGrades = classify_all(artifact.net, imds);
predictedReferable = double(string(predictedGrades)) >= 2;

tp = nnz(actualReferable & predictedReferable);
fn = nnz(actualReferable & ~predictedReferable);
tn = nnz(~actualReferable & ~predictedReferable);
fp = nnz(~actualReferable & predictedReferable);

referable = struct();
referable.sensitivity = tp / max(tp + fn, 1);
referable.specificity = tn / max(tn + fp, 1);
referable.truePositives = tp;
referable.falseNegatives = fn;
referable.trueNegatives = tn;
referable.falsePositives = fp;
referable.n = numel(imds.Labels);

results = struct();
results.model = modelName;
results.dataset = "Messidor-2";
results.numImages = numel(imds.Labels);
results.fiveClassMetrics = metrics;
results.referableDR = referable;
results.evaluatedAt = string(datetime("now", TimeZone="local", Format="yyyy-MM-dd HH:mm:ss Z"));

fprintf("Messidor-2 external validation (%s): n=%d\n", modelName, results.numImages);
fprintf("  5-class accuracy:      %.4f\n", metrics.accuracy);
fprintf("  Referable DR sensitivity: %.4f (target > 0.90)\n", referable.sensitivity);
fprintf("  Referable DR specificity: %.4f (target > 0.85)\n", referable.specificity);

outDir = fullfile(fileparts(fileparts(mfilename("fullpath"))), "..", "results", "external_validation");
if ~isfolder(outDir)
    mkdir(outDir);
end
suffix = "";
if options.Enhanced
    suffix = "_enhanced";
end
outPath = fullfile(outDir, modelName + "_messidor2_external" + suffix + ".json");
fid = fopen(outPath, "w");
fprintf(fid, "%s", jsonencode(results, PrettyPrint=true));
fclose(fid);
fprintf("Saved results to %s\n", outPath);
end

function predicted = classify_all(net, datastore)
reset(datastore);
predicted = classify(net, datastore);
end
