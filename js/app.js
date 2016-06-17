// Putt Visualization
// James Thornbrue
// 2016-06-10

// unit conversions
function degrees(r) {
	return r * 180.0 / Math.PI;
}

function g(mps) {
	return mps / 9.81;
}

function mph(mps) {
	return mps * 2.23694;
}

function inches(m) {
	return m * 39.3701;
}

// helper functions
function norm(obj) {
	return Math.sqrt(obj.x * obj.x + obj.y * obj.y + obj.z * obj.z);
}

function limit(lim, x) {
	return x > lim ? lim : x < -lim ? -lim : x;
}

// angular
angular.module("app", [])

.controller("main", function ($scope, $log, $http, $rootScope) {

	$scope.show_metrics = true;
    $scope.obj = undefined;
    $scope.valid = true;
    $scope.metrics = undefined;
    
    $scope.toggle_show_metrics = function () {
    	$scope.show_metrics = !$scope.show_metrics;
    }
    
    function upload(file, result) {
    
    	$scope.file = file;
    	$scope.json = JSON.parse(result);
    	$scope.metrics = [];
        
        document.getElementById('plotly').innerHTML = '';
    	
    	if ($scope.json.capture == undefined) {
    		$scope.valid = false;
    		return;
    	}
    
    	$scope.valid = true;
    	
    	var gyr = _.map($scope.json.capture.calibratedSensorData.samples, function (sample) {
            
            var xyz = _.map(sample[2].split(','),  parseFloat);
            	
            return {
            	timestamp: sample[0],
            	x: xyz[0],
            	y: xyz[1],
            	z: xyz[2]
            };
        });
        
        var vel;
        
        _.each($scope.json.capture.activities[0].actions[0].metricGroups, function (group) {
        	_.each(group.metrics, function (metric) {
        		if (metric.type == 'clubhead velocity vector') {
        			var dt = metric.samplingPeriod;
        			var k = -1;
        			vel = _.map(metric.values, function (value) {
        				++k;
        				var xyz = _.map(value.split(','), parseFloat);
        				
        				return {
        					timestamp: k * dt,
        					x: xyz[0],
        					y: xyz[1],
        					z: xyz[2]
        				};
        			});        			
        		} else if (metric.composition == 'scalar') {
        			$scope.metrics.push(metric);
        		}
        	});        
        });
        
        var data = [];
        
        if (gyr) {
        	data.push({
        		x: _.pluck(gyr, 'timestamp'),
        		y: _.map(_.pluck(gyr, 'x'), degrees),
        		name: 'gyro x',
        		type: 'scatter',
        		yaxis: 'y1'
        	});
        	
        	data.push({
        		x: _.pluck(gyr, 'timestamp'),
        		y: _.map(_.pluck(gyr, 'y'), degrees),
        		name: 'gyro y',
        		type: 'scatter',
        		yaxis: 'y1'
        	});
        	
        	data.push({
        		x: _.pluck(gyr, 'timestamp'),
        		y: _.map(_.pluck(gyr, 'z'), degrees),
        		name: 'gyro z',
        		type: 'scatter',
        		yaxis: 'y1'
        	});
        }
        
        if (vel) {
        	var acc = _.map(_.zip(_.slice(vel, 0, vel.length - 1), _.slice(vel, 1)), function (pair) {
        		var v0 = _.first(pair);
        		var v1 = _.last(pair);
        		var dt = v1.timestamp - v0.timestamp;
        		return {
        			'timestamp': v1.timestamp,
        			'x': (v1.x - v0.x) / dt,
        			'y': (v1.y - v0.y) / dt,
        			'z': (v1.z - v0.z) / dt
        		};
        	});
        	
        	var pos = [];
        	var sum = {
        		'timestamp': _.first(vel).timestamp,
        		'x': 0.0,
        		'y': 0.0,
        		'z': 0.0
        	};
        	_.each(vel, function (v) {
        		var dt = v.timestamp - sum.timestamp;
        		sum.timestamp = v.timestamp;
        		sum.x += v.x * dt;
        		sum.y += v.y * dt;
        		sum.z += v.z * dt;
        		pos.push(_.clone(sum));
        	});
        
        	data.push({
        		x: _.pluck(acc, 'timestamp'),
        		y: _.map(_.map(_.map(acc, 'x'), g), _.partial(limit, 10)),
        		name: 'acc (g)',
        		type: 'scatter',
        		yaxis: 'y2'
        	});
        	
        	data.push({
        		x: _.pluck(vel, 'timestamp'),
        		y: _.map(_.pluck(vel, 'x'), mph),
        		name: 'speed (mph)',
        		type: 'scatter',
        		yaxis: 'y2'
        	});
        	
        	data.push({
        		x: _.pluck(pos, 'timestamp'),
        		y: _.map(_.pluck(pos, 'x'), inches),
        		name: 'position (in)',
        		type: 'scatter',
        		yaxis: 'y2'
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
        	yaxis: {domain: [0.54, 1], title: 'deg/s'},
        	yaxis2: {domain: [0, 0.46]},
        	xaxis: {anchor: 'y2'},
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

