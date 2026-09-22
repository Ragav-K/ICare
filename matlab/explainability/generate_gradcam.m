function out = generate_gradcam(net, img, imagePath, modelName, classIdx)
out = struct("status", "unavailable", "reason", "Grad-CAM was not generated");
try
    scoreMap = double(gradCAM(net, img, classIdx));
    scoreMap(~isfinite(scoreMap)) = 0;
    scoreMap = max(imresize(scoreMap, size(img, [1 2])), 0);
    peak = max(scoreMap, [], "all");
    if peak > 0
        scoreMap = scoreMap / peak;
    end
    heatmap = ind2rgb(uint8(round(scoreMap * 255)), turbo(256));
    alpha = 0.55 * max((scoreMap - 0.30) / 0.70, 0);
    original = im2double(img);
    overlay = original;
    for channel = 1:3
        overlay(:, :, channel) = original(:, :, channel) .* (1 - alpha) + heatmap(:, :, channel) .* alpha;
    end
    overlay = im2uint8(overlay);

    cfg = icare_config();
    outputRoot = fullfile(string(cfg.modelRoot), "inference_outputs");
    if ~isfolder(outputRoot)
        mkdir(outputRoot);
    end
    [~, imageStem] = fileparts(imagePath);
    modelStem = lower(regexprep(string(modelName), "[^a-zA-Z0-9]+", "_"));
    stamp = string(datetime("now", Format="yyyyMMdd_HHmmss_SSS"));
    outputPath = fullfile(outputRoot, imageStem + "_" + modelStem + "_" + stamp + "_gradcam.png");
    imwrite(overlay, outputPath);
    out = struct("status", "completed", "imagePath", string(outputPath), ...
        "note", "Warm regions influenced the predicted class on a 224-pixel classifier input; this is not a verified lesion map.");
catch ME
    out.reason = string(ME.message);
end
end
