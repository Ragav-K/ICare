function tbl = read_drive_vessel_dataset(dataRoot)
if nargin < 1 || strlength(string(dataRoot)) == 0
    cfg = icare_config();
    dataRoot = cfg.dataRoot;
end

driveRoot = fullfile(dataRoot, "DRIVE");
imageRoot = fullfile(driveRoot, "training", "images");
maskRoot = fullfile(driveRoot, "training", "1st_manual");

if ~isfolder(imageRoot)
    error("ICare:DRIVE:MissingImages", "DRIVE training images not found at %s", imageRoot);
end
if ~isfolder(maskRoot)
    error("ICare:DRIVE:MissingMasks", "DRIVE manual vessel masks not found at %s", maskRoot);
end

images = dir(fullfile(imageRoot, "*_training.tif"));
imagePaths = strings(numel(images), 1);
maskPaths = strings(numel(images), 1);
ids = strings(numel(images), 1);

for i = 1:numel(images)
    imagePaths(i) = fullfile(images(i).folder, images(i).name);
    id = extractBefore(string(images(i).name), "_training");
    ids(i) = id;
    maskPaths(i) = fullfile(maskRoot, id + "_manual1.gif");
end

existsMask = isfile(maskPaths);
if any(~existsMask)
    missing = strjoin(maskPaths(~existsMask), newline);
    error("ICare:DRIVE:UnpairedMasks", "Missing DRIVE mask files:%s%s", newline, missing);
end

tbl = table(ids, imagePaths, maskPaths, VariableNames=["id", "imagePath", "maskPath"]);
end
