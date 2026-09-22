function mask = read_drive_vessel_mask(filename, imageSize)
mask = imread(filename);
if ndims(mask) > 2
    mask = mask(:, :, 1);
end
mask = imresize(mask, imageSize(1:2), "nearest");
mask = mask > 0;
end
