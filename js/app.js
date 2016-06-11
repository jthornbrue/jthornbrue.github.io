/* angular module dependencies */
angular.module("app", [])

.controller("main", function ($scope, $log, $http, $rootScope) {

    $scope.obj = undefined;
    $scope.valid = true;
    
    function to_arrays(items) {
    	return {
    		timestamp: _.pluck(items, 'timestamp'),
    		x: _.pluck(items, 'x'),
    		y: _.pluck(items, 'y'),
    		z: _.pluck(items, 'z'),
    		norm: _.map(items, function(item) {
    			return Math.sqrt(item.x * item.x + item.y * item.y + item.z * item.z);
    		})
    	};
    }
    
    function upload(file, result) {
    
    	$scope.file = file;
    	$scope.json = JSON.parse(result);
    	document.getElementById('plotly').innerHTML = '';
    	
    	if ($scope.json.capture == undefined) {
    		$scope.valid = false;
    		return;
    	}
    
    	$scope.valid = true;
    
    	var gyr = to_arrays(_.map($scope.json.capture.calibratedSensorData.samples, function (sample) {
            
            var xyz = _.map(sample[2].split(','),  parseFloat);
            	
            return {
            	timestamp: sample[0],
            	x: xyz[0],
            	y: xyz[1],
            	z: xyz[2]
            };
        }));
        
        var acc = to_arrays(_.map($scope.json.capture.calibratedSensorData.samples, function (sample) {
            
        	var xyz = _.map(sample[1].split(','),  parseFloat);
            	
        	return {
            	timestamp: sample[0],
            	x: xyz[0],
            	y: xyz[1],
            	z: xyz[2]
            };
        }));
        
        var vel;
        
        _.each($scope.json.capture.activities[0].actions[0].metricGroups, function (group) {
        	_.each(group.metrics, function (metric) {
        		if (metric.type == 'clubhead velocity vector') {
        			var dt = metric.samplingPeriod;
        			var k = -1;
        			vel = to_arrays(_.map(metric.values, function (value) {
        				++k;
        				var xyz = _.map(value.split(','), parseFloat);
        				
        				return {
        					timestamp: k * dt,
        					x: xyz[0],
        					y: xyz[1],
        					z: xyz[2]
        				};
        			}));        			
        		}
        	});        
        });
        
        var data = [];
        
        if (acc) {
        	data.push({
        		x: acc.timestamp,
        		y: acc.x,
        		name: 'acc x',
        		type: 'scatter'
        	});
        	
        	data.push({
        		x: acc.timestamp,
        		y: acc.y,
        		name: 'acc y',
        		type: 'scatter'
        	});
        	
        	data.push({
        		x: acc.timestamp,
        		y: acc.z,
        		name: 'acc z',
        		type: 'scatter'
        	});
        }
        
        if (gyr) {
        	data.push({
        		x: gyr.timestamp,
        		y: gyr.x,
        		name: 'gyr x',
        		type: 'scatter',
        		yaxis: 'y2'
        	});
        	
        	data.push({
        		x: gyr.timestamp,
        		y: gyr.y,
        		name: 'gyr y',
        		type: 'scatter',
        		yaxis: 'y2'
        	});
        	
        	data.push({
        		x: gyr.timestamp,
        		y: gyr.z,
        		name: 'gyr z',
        		type: 'scatter',
        		yaxis: 'y2'
        	});
        }
        
        if (vel) {
        	data.push({
        		x: vel.timestamp,
        		y: vel.x,
        		name: 'vel x',
        		type: 'scatter',
        		yaxis: 'y3'
        	});
        	
        	data.push({
        		x: vel.timestamp,
        		y: vel.y,
        		name: 'vel y',
        		type: 'scatter',
        		yaxis: 'y3'
        	});
        	
        	data.push({
        		x: vel.timestamp,
        		y: vel.z,
        		name: 'vel z',
        		type: 'scatter',
        		yaxis: 'y3'
        	});
        	
        	data.push({
        		x: vel.timestamp,
        		y: vel.norm,
        		name: 'speed',
        		type: 'scatter',
        		yaxis: 'y3'
        	});
        }
        
        var events = $scope.json.capture.activities[0].actions[0].eventMarkers;
        
        var shapes = _.map(events, function (event) {
        	return {
    			'type': 'line',
    			'yref': 'paper',
    			'x0': event.time,
    			'y0': 0.0,
    			'x1': event.time,
    			'y1': 1.0,
    			'line': {
    				'width': 1.0,
    				'color': 'rgba(0, 0, 0, 0.5)'
    			}
    		};
    	});
    	
    	var y = -1;
    	
    	var annotations = _.map(events, function (event) {
    		
    		++y;
    		
    		var names = [
    			'start of action',
    			'end of action',
    			'peak linear acceleration',
    			'peak angular velocity',
    			'peak angular acceleration',
    			'start of data',
    			'end of data',
    			'impact',
    			'start of downswing',
    			'peak wrist snap',
    			'peak speed',
    			'take off',
    			'landing',
    			'start of backswing',
    			'peak height',
    			'start of backstroke',
    			'start of forward stroke'
    		];
    		
    		var name = names[event.eventType];
    		
    		return {
    			'yref': 'paper',
    			'x': event.time,
    			'y': events.length == 1 ? 1 : y / (events.length - 1),
    			'text': name,
    			'showarrow': false,
    			'xanchor': 'left',
    			
    		};
    		
    	});
        
        var layout = {
        	yaxis: {domain: [0.7, 1], title: 'm/s<sup>2</sup>'},
        	yaxis2: {domain: [0.35, 0.65], title:'deg/s'},
        	yaxis3: {domain: [0, 0.3], title:'m/s'},
        	xaxis: {anchor: 'y3'},
        	shapes: shapes,
        	annotations: annotations
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

