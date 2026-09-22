function mask = read_idrid_lesion_mask(filename, imageSize)
filename = string(filename);
if strlength(filename) == 0 || ~isfile(filename)
    mask = false(imageSize(1), imageSize(2));
    return;
end

mask = imread(filename);
if ndims(mask) > 2
    mask = mask(:, :, 1);
end
mask = imresize(mask, imageSize(1:2), "nearest");
mask = mask > 0;
end
