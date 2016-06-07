/* angular module dependencies */
angular.module("app", [])

.controller("main", function ($scope, $log, $http, $rootScope) {

    $scope.obj = undefined;
    
    function upload(file, result) {
    
    	$scope.loaded = true;
    
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
            
        var acc = _.map($scope.json.capture.calibratedSensorData.samples, function (sample) {
            
        	var xyz = _.map(sample[1].split(','),  parseFloat);
            	
        	return {
            	timestamp: sample[0],
            	x: xyz[0],
            	y: xyz[1],
            	z: xyz[2]
            };
        });
        
        acc = {
            timestamp: _.pluck(acc, 'timestamp'),
            x: _.pluck(acc, 'x'),
            y: _.pluck(acc, 'y'),
            z: _.pluck(acc, 'z')
        };
        
        $scope.acc = acc;
        
    	var data = [{
        	x: acc.timestamp,
        	y: acc.x,
        	name: 'acc x',
        	type: 'scatter'
        }, {
        	x: acc.timestamp,
        	y: acc.y,
        	name: 'acc y',
        	type: 'scatter'
        }, {
        	x: acc.timestamp,
        	y: acc.z,
        	name: 'acc z',
        	type: 'scatter'
        }, {
        	x: gyr.timestamp,
        	y: gyr.x,
        	name: 'gyr x',
        	type: 'scatter',
        	xaxis: 'x',
        	yaxis: 'y2'
        }, {
        	x: gyr.timestamp,
        	y: gyr.y,
        	name: 'gyr y',
        	type: 'scatter',
        	xaxis: 'x',
        	yaxis: 'y2'
        }, {
        	x: gyr.timestamp,
        	y: gyr.z,
        	name: 'gyr z',
        	type: 'scatter',
        	xaxis: 'x',
        	yaxis: 'y2'
        }];
        
        var layout = {
        	title: 'Calibrated Data',
        	yaxis: {domain: [.55, 1], title: 'm/s<sup>2</sup>'},
        	yaxis2: {domain: [0, .45], title:'deg/s'},
        	xaxis: {anchor: 'y2'}
        };
        
        Plotly.newPlot('plotly', data, layout);
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

