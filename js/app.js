/* angular module dependencies */
angular.module("app", [])

.controller("main", function ($scope, $log, $http, $rootScope) {

    $scope.obj = undefined;
    
    function upload(file, result) {
    
    	$scope.file = file;
    	
    	$scope.json = JSON.parse(result);
    	
    	var gyr = _.map($scope.json.capture.calibratedSensorData.samples, function (sample) {
            
            var xyz = _.map(sample[2].split(','),  parseFloat);
            	
            return {
            	timestamp: sample[0],
            	x: xyz[0],
            	y: xyz[1],
            	z: xyz[2]
            };
        });
        
        gyr = {
            	timestamp: _.pluck(gyr, 'timestamp'),
            	x: _.pluck(gyr, 'x'),
            	y: _.pluck(gyr, 'y'),
            	z: _.pluck(gyr, 'z')
            };
        
        $scope.gyr = gyr;
        
    	var data = [{
        	x: gyr.timestamp,
        	y: gyr.x,
        	name: 'x',
        	type: 'scatter'
        }, {
        	x: gyr.timestamp,
        	y: gyr.y,
        	name: 'y',
        	type: 'scatter'
        }, {
        	x: gyr.timestamp,
        	y: gyr.z,
        	name: 'z',
        	type: 'scatter'
        }];
        
        var layout = {
        	title: 'Calibrated Gyro'
        };
        
        Plotly.newPlot('cal-gyr', data, layout);
    }

    // setup drag/drop zone over the map
    var dropZone = document.body;

    dropZone.addEventListener('dragover', function(e) {
        e.stopPropagation();
        e.preventDefault();
    });

    dropZone.addEventListener('drop', function(drop) {
        drop.stopPropagation();
        drop.preventDefault();
        _.each(drop.dataTransfer.files, function(file) {
            $log.debug(file.name);
            var reader = new FileReader();
            reader.onloadend = function(loadend) {
                $rootScope.$apply(function () {
                    upload(file, reader.result);
                });
            };
            reader.readAsText(file);
        });
    });
})

.filter('timestamp', function () {
    return function (t) {
        return t ? moment.utc(t).format('YYYY-MM-DD HH:mm:ss[Z]') : '';
    };
})

;

