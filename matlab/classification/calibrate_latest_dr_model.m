function calibration = calibrate_latest_dr_model(modelName, varargin)
%CALIBRATE_LATEST_DR_MODEL Add validation confidence calibration to latest model.
%   modelName must be "resnet50" or "mobilenetv2".

opts = parse_options(varargin{:});
cfg = icare_config();
tbl = read_aptos_dataset(cfg.dataRoot);
imageSize = [224 224 3];
classNames = categorical(["0", "1", "2", "3", "4"]);

imds = imageDatastore(tbl.imagePath, Labels=tbl.diagnosis, ReadFcn=@read_fundus_rgb);
rng(opts.seed);
[~, restDs] = splitEachLabel(imds, 0.70, "randomized");
[valDs, ~] = splitEachLabel(restDs, 0.50, "randomized");
calibrationDs = imageDatastore(valDs.Files, Labels=valDs.Labels, ReadFcn=@(filename) read_fundus_for_network(filename, imageSize));

modelName = lower(string(modelName));
switch modelName
    case "resnet50"
        modelPath = fullfile(cfg.modelRoot, "resnet50_dr.mat");
    case "mobilenetv2"
        modelPath = fullfile(cfg.modelRoot, "mobilenetv2_dr.mat");
    otherwise
        error("ICare:Calibration:UnknownModel", "modelName must be resnet50 or mobilenetv2.");
end

if ~isfile(modelPath)
    error("ICare:Calibration:MissingModel", "Model artifact not found: %s", modelPath);
end

artifact = load(modelPath);
if ~isfield(artifact, "net")
    error("ICare:Calibration:InvalidArtifact", "Model artifact does not contain net: %s", modelPath);
end

calibration = calibrate_classification_confidence(artifact.net, calibrationDs, calibrationDs.Labels, classNames, NumBins=opts.numBins);
confidenceCalibration = calibration;
save(modelPath, "confidenceCalibration", "-append");

fprintf("Saved confidence calibration into %s\n", modelPath);
fprintf("Validation accuracy: %.4f | ECE: %.4f\n", calibration.validationAccuracy, calibration.expectedCalibrationError);
end

function opts = parse_options(varargin)
parser = inputParser;
addParameter(parser, "numBins", 10, @(x) isnumeric(x) && x >= 2);
addParameter(parser, "seed", 26038, @(x) isnumeric(x));
parse(parser, varargin{:});
opts = parser.Results;
end
