function tbl = read_aptos_dataset(dataRoot)
if nargin < 1 || strlength(string(dataRoot)) == 0
    cfg = icare_config();
    dataRoot = cfg.dataRoot;
end

aptosRoot = fullfile(dataRoot, "APTOS");
labelsPath = fullfile(aptosRoot, "train.csv");
imageRoot = fullfile(aptosRoot, "train_images");

if ~isfile(labelsPath)
    error("ICare:APTOS:MissingLabels", "APTOS train.csv not found at %s", labelsPath);
end
if ~isfolder(imageRoot)
    error("ICare:APTOS:MissingImages", "APTOS train_images folder not found at %s", imageRoot);
end

labels = readtable(labelsPath, TextType="string");
required = ["id_code", "diagnosis"];
if ~all(ismember(required, string(labels.Properties.VariableNames)))
    error("ICare:APTOS:InvalidLabels", "APTOS train.csv must contain id_code and diagnosis columns.");
end

labels.imagePath = fullfile(imageRoot, labels.id_code + ".png");
existsMask = isfile(labels.imagePath);
if any(~existsMask)
    warning("ICare:APTOS:MissingImageRows", "%d APTOS label rows have no matching PNG and will be skipped.", nnz(~existsMask));
end

tbl = labels(existsMask, :);
tbl.diagnosis = categorical(tbl.diagnosis, 0:4, ["0", "1", "2", "3", "4"]);
end
