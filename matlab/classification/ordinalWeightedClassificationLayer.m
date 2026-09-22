classdef ordinalWeightedClassificationLayer < nnet.layer.ClassificationLayer
    %ORDINALWEIGHTEDCLASSIFICATIONLAYER Class-weighted CE plus ordinal distance.

    properties
        ClassWeights
        OrdinalPenaltyWeight
    end

    methods
        function layer = ordinalWeightedClassificationLayer(classes, classWeights, ordinalPenaltyWeight, name)
            layer.Name = char(name);
            layer.Description = "Class-weighted cross-entropy with ordinal severity penalty";
            layer.Classes = categorical(classes);
            layer.ClassWeights = single(classWeights(:));
            layer.OrdinalPenaltyWeight = single(ordinalPenaltyWeight);
        end

        function loss = forwardLoss(layer, Y, T)
            Y = max(Y, single(1e-7));
            classWeights = reshape(layer.ClassWeights, 1, 1, [], 1);
            grades = reshape(single(0:(numel(layer.ClassWeights) - 1)), 1, 1, [], 1);

            weightedCe = -sum(T .* log(Y) .* classWeights, 3);
            trueGrade = sum(T .* grades, 3);
            ordinalDistance = sum(Y .* abs(grades - trueGrade), 3) ./ max(single(numel(layer.ClassWeights) - 1), single(1));
            lossByObservation = weightedCe + layer.OrdinalPenaltyWeight .* ordinalDistance;
            loss = mean(lossByObservation, "all");
        end
    end
end
