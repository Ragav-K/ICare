function calibration = calibrate_classification_confidence(net, datastore, labels, classNames, varargin)
%CALIBRATE_CLASSIFICATION_CONFIDENCE Estimate reliability of top-class scores.
%   Uses equal-width confidence bins on a validation datastore. The calibrated
%   confidence is the empirical accuracy of predictions in the nearest bin.

opts = parse_options(varargin{:});
reset(datastore);

scores = zeros(numel(datastore.Files), numel(classNames));
predicted = categorical(strings(numel(datastore.Files), 1), string(classNames));

for i = 1:numel(datastore.Files)
    img = readimage(datastore, i);
    [predicted(i), scores(i, :)] = classify(net, img);
end

actual = categorical(string(labels(:)), string(classNames));
[topConfidence, ~] = max(scores, [], 2);
correct = predicted(:) == actual(:);

edges = linspace(0, 1, opts.numBins + 1);
binCenters = (edges(1:end-1) + edges(2:end)) / 2;
empiricalAccuracy = nan(opts.numBins, 1);
meanConfidence = nan(opts.numBins, 1);
counts = zeros(opts.numBins, 1);

for b = 1:opts.numBins
    if b == opts.numBins
        inBin = topConfidence >= edges(b) & topConfidence <= edges(b + 1);
    else
        inBin = topConfidence >= edges(b) & topConfidence < edges(b + 1);
    end
    counts(b) = nnz(inBin);
    if counts(b) > 0
        empiricalAccuracy(b) = mean(correct(inBin));
        meanConfidence(b) = mean(topConfidence(inBin));
    end
end

filledAccuracy = empiricalAccuracy;
overallAccuracy = mean(correct);
for b = 1:opts.numBins
    if isnan(filledAccuracy(b))
        nearest = find(~isnan(empiricalAccuracy), 1, "first");
        if isempty(nearest)
            filledAccuracy(b) = overallAccuracy;
        else
            [~, nearestIdx] = min(abs(binCenters(~isnan(empiricalAccuracy)) - binCenters(b)));
            validIdx = find(~isnan(empiricalAccuracy));
            filledAccuracy(b) = empiricalAccuracy(validIdx(nearestIdx));
        end
    end
end

ece = 0;
for b = 1:opts.numBins
    if counts(b) > 0
        ece = ece + (counts(b) / numel(topConfidence)) * abs(empiricalAccuracy(b) - meanConfidence(b));
    end
end

calibration = struct();
calibration.method = "validation_bin_empirical_accuracy";
calibration.numBins = opts.numBins;
calibration.binEdges = edges;
calibration.binCenters = binCenters;
calibration.empiricalAccuracy = empiricalAccuracy;
calibration.filledAccuracy = filledAccuracy;
calibration.meanConfidence = meanConfidence;
calibration.counts = counts;
calibration.validationAccuracy = overallAccuracy;
calibration.expectedCalibrationError = ece;
calibration.generatedAt = string(datetime("now", TimeZone="local", Format="yyyy-MM-dd HH:mm:ss Z"));
end

function opts = parse_options(varargin)
parser = inputParser;
addParameter(parser, "numBins", 10, @(x) isnumeric(x) && x >= 2);
parse(parser, varargin{:});
opts = parser.Results;
opts.numBins = double(opts.numBins);
end
