function cfg = icare_config()
cfg = struct();
cfg.dataRoot = getenv("MATLAB_DATA_ROOT");
cfg.modelRoot = getenv("MATLAB_MODEL_ROOT");
if strlength(cfg.dataRoot) == 0
    cfg.dataRoot = fullfile(getenv("USERPROFILE"), "MATLAB Drive", "ICare", "data");
end
if strlength(cfg.modelRoot) == 0
    cfg.modelRoot = fullfile(getenv("USERPROFILE"), "MATLAB Drive", "ICare", "models");
end
cfg.modelVersion = "untrained-local-0.1";
end
