function img = read_idrid_image_for_network(filename, imageSize)
img = read_fundus_rgb(filename);
img = imresize(img, imageSize(1:2));
end
