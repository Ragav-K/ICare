function metrics = evaluate_classification(net, datastore, labels, classNames)
predicted = classify_datastore_images(net, datastore, classNames);
actual = labels;
actual = categorical(string(actual(:)), string(classNames));
predicted = categorical(string(predicted(:)), string(classNames));

confMat = confusionmat(actual, predicted, Order=categorical(string(classNames(:)), string(classNames)));
accuracy = mean(predicted == actual);

precision = zeros(numel(classNames), 1);
recall = zeros(numel(classNames), 1);
specificity = zeros(numel(classNames), 1);
f1 = zeros(numel(classNames), 1);

for i = 1:numel(classNames)
    tp = confMat(i, i);
    fp = sum(confMat(:, i)) - tp;
    fn = sum(confMat(i, :)) - tp;
    tn = sum(confMat, "all") - tp - fp - fn;

    precision(i) = safe_divide(tp, tp + fp);
    recall(i) = safe_divide(tp, tp + fn);
    specificity(i) = safe_divide(tn, tn + fp);
    f1(i) = safe_divide(2 * precision(i) * recall(i), precision(i) + recall(i));
end

metrics = struct();
metrics.accuracy = accuracy;
metrics.classNames = cellstr(classNames);
metrics.confusionMatrix = confMat;
metrics.precision = precision;
metrics.sensitivity = recall;
metrics.recall = recall;
metrics.specificity = specificity;
metrics.f1 = f1;
metrics.macroF1 = mean(f1, "omitnan");
metrics.evaluatedAt = string(datetime("now", TimeZone="local", Format="yyyy-MM-dd HH:mm:ss Z"));
end

function predicted = classify_datastore_images(net, datastore, classNames)
reset(datastore);
predicted = categorical(strings(numel(datastore.Files), 1), string(classNames));
for i = 1:numel(datastore.Files)
    img = readimage(datastore, i);
    predicted(i) = classify(net, img);
end
end

function value = safe_divide(numerator, denominator)
if denominator == 0
    value = NaN;
else
    value = numerator / denominator;
end
end
