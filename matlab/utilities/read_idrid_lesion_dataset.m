function tbl = read_idrid_lesion_dataset(dataRoot, lesionType, splitName)
if nargin < 1 || strlength(string(dataRoot)) == 0
    cfg = icare_config();
    dataRoot = cfg.dataRoot;
end
if nargin < 2
    lesionType = "Microaneurysms";
end
if nargin < 3
    splitName = "training";
end

info = idrid_lesion_info(lesionType);
isTraining = startsWith(lower(string(splitName)), "train");
if isTraining
    imageSplitFolder = "a. Training Set";
else
    imageSplitFolder = "b. Testing Set";
end

idridRoot = fullfile(dataRoot, "IDRiD", "A. Segmentation");
imageRoot = fullfile(idridRoot, "1. Original Images", imageSplitFolder);
maskRoot = fullfile(idridRoot, "2. All Segmentation Groundtruths", imageSplitFolder, info.folder);

if ~isfolder(imageRoot)
    error("ICare:IDRiD:MissingImages", "IDRiD images not found at %s", imageRoot);
end
if ~isfolder(maskRoot)
    error("ICare:IDRiD:MissingMasks", "IDRiD %s masks not found at %s", info.name, maskRoot);
end

images = dir(fullfile(imageRoot, "*.jpg"));
ids = strings(numel(images), 1);
imagePaths = strings(numel(images), 1);
maskPaths = strings(numel(images), 1);
hasMask = false(numel(images), 1);

for i = 1:numel(images)
    imagePaths(i) = fullfile(images(i).folder, images(i).name);
    id = extractBefore(string(images(i).name), ".jpg");
    ids(i) = id;
    candidate = fullfile(maskRoot, id + info.suffix + ".tif");
    if isfile(candidate)
        maskPaths(i) = candidate;
        hasMask(i) = true;
    else
        maskPaths(i) = "";
    end
end

tbl = table(ids, imagePaths, maskPaths, hasMask, VariableNames=["id", "imagePath", "maskPath", "hasMask"]);
tbl.lesionType = repmat(string(info.name), height(tbl), 1);
tbl.missingMaskMeansEmpty = ~tbl.hasMask;
end
