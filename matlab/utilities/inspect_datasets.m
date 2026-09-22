function report = inspect_datasets(dataRoot)
if nargin < 1 || strlength(string(dataRoot)) == 0
    cfg = icare_config();
    dataRoot = cfg.dataRoot;
end

datasets = ["APTOS", "IDRiD", "DRIVE", "Messidor-2"];
report = struct();
report.dataRoot = string(dataRoot);
report.datasets = struct();

fprintf("ICare dataset root: %s\n", dataRoot);
for i = 1:numel(datasets)
    name = datasets(i);
    folder = fullfile(dataRoot, name);
    key = matlab.lang.makeValidName(name);
    item = struct();
    item.path = string(folder);
    item.exists = isfolder(folder);
    item.imageCount = 0;
    item.csvCount = 0;

    if item.exists
        imageFiles = [ ...
            dir(fullfile(folder, "**", "*.jpg")); ...
            dir(fullfile(folder, "**", "*.jpeg")); ...
            dir(fullfile(folder, "**", "*.png")); ...
            dir(fullfile(folder, "**", "*.tif")); ...
            dir(fullfile(folder, "**", "*.tiff")) ...
        ];
        csvFiles = dir(fullfile(folder, "**", "*.csv"));
        item.imageCount = numel(imageFiles);
        item.csvCount = numel(csvFiles);
        fprintf("[OK] %s: %d images, %d csv files\n", name, item.imageCount, item.csvCount);
    else
        fprintf("[MISSING] %s at %s\n", name, folder);
    end

    report.datasets.(key) = item;
end
end
