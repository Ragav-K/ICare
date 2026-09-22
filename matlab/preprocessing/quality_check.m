function result = quality_check(imagePath)
img = imread(imagePath);
gray = im2gray(img);
retinalMask = retinal_field_mask(img);
retinalCoverage = nnz(retinalMask) / numel(retinalMask);
fieldDetected = retinalCoverage >= 0.15;

lap = del2(double(gray));
if fieldDetected
    retinalPixels = double(gray(retinalMask));
    blurScore = var(lap(retinalMask));
    brightness = mean(retinalPixels) / 255;
    retinalContrast = std(retinalPixels) / 255;
else
    blurScore = 0;
    brightness = 0;
    retinalContrast = 0;
end
% The existing contrast cutoff was set on whole images; retinal contrast
% needs a separately validated cutoff before it can control acceptance.
contrastValue = std(double(gray(:))) / 255;

issues = strings(0);
if ~fieldDetected
    issues(end + 1) = "retinal field not visible; recapture image";
end
if blurScore < 0.25
    issues(end + 1) = "improve focus";
end
if brightness < 0.18
    issues(end + 1) = "improve lighting";
end
if brightness > 0.88
    issues(end + 1) = "reduce glare or overexposure";
end
if contrastValue < 0.08
    issues(end + 1) = "increase retinal contrast";
end

result = struct();
result.acceptable = isempty(issues);
result.blurScore = blurScore;
result.brightness = brightness;
result.contrast = contrastValue;
result.retinalContrast = retinalContrast;
result.retinalCoverage = retinalCoverage;
result.guidance = cellstr(issues);
end
