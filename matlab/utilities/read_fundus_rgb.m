function img = read_fundus_rgb(filename)
img = imread(filename);
if ndims(img) == 2
    img = repmat(img, 1, 1, 3);
end
if size(img, 3) > 3
    img = img(:, :, 1:3);
end
end
