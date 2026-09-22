function tbl = read_messidor2_dataset(dataRoot)
if nargin < 1 || strlength(string(dataRoot)) == 0
    cfg = icare_config();
    dataRoot = cfg.dataRoot;
end

messidorRoot = fullfile(dataRoot, "Messidor-2");
labelsPath = fullfile(messidorRoot, "messidor_data.csv");
imageRoot = fullfile(messidorRoot, "IMAGES");

if ~isfile(labelsPath)
    error("ICare:Messidor2:MissingLabels", "Messidor-2 messidor_data.csv not found at %s", labelsPath);
end
if ~isfolder(imageRoot)
    error("ICare:Messidor2:MissingImages", "Messidor-2 IMAGES folder not found at %s", imageRoot);
end

labels = readtable(labelsPath, TextType="string");
required = ["id_code", "diagnosis", "adjudicated_gradable"];
if ~all(ismember(required, string(labels.Properties.VariableNames)))
    error("ICare:Messidor2:InvalidLabels", "Messidor-2 messidor_data.csv must contain id_code, diagnosis, and adjudicated_gradable columns.");
end

labels = labels(labels.adjudicated_gradable == 1, :);

labels.imagePath = fullfile(imageRoot, labels.id_code);
existsMask = isfile(labels.imagePath);
if any(~existsMask)
    warning("ICare:Messidor2:MissingImageRows", "%d Messidor-2 label rows have no matching image and will be skipped.", nnz(~existsMask));
end

tbl = labels(existsMask, :);
tbl.diagnosis = categorical(tbl.diagnosis, 0:4, ["0", "1", "2", "3", "4"]);
end
