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

    $scope.detail_report = false;
    $scope.obj = undefined;
    $scope.valid = true;
    $scope.metrics = undefined;
    
    $scope.toggle_detail_report = function () {
        $scope.detail_report = !$scope.detail_report;
    }

    $scope.metric = function (type) {
        return _.find($scope.metrics, {'type': type}) || {'type': type};
    };
    
    function upload(file, result) {
    
        $scope.file = file;
        $scope.json = JSON.parse(result);
        $scope.metrics = [];
        $scope.valid = false;

        document.getElementById('plotly').innerHTML = '';
        
        var gyr;
        var acc;
        var vel;
        var pos;
        var events;

        if ($scope.json.SensorCalibratedData) {
            // old JSON format
            gyr = _.map($scope.json.SensorCalibratedData, function (sample) {
                return {
                    timestamp: sample.TimeStamp,
                    x: sample.gX,
                    y: sample.gY,
                    z: sample.gZ
                }
            });

            vel = _.map($scope.json.SensorIntegratedData, function (sample) {
                return {
                    timestamp: sample.TimeStamp,
                    x: sample.vX,
                    y: sample.vY,
                    z: sample.vZ,
                }
            });

            pos = _.map($scope.json.SensorIntegratedData, function (sample) {
                return {
                    timestamp: sample.TimeStamp,
                    x: sample.pX,
                    y: sample.pY,
                    z: sample.pZ,
                }
            });


        } else if ($scope.json.capture) {
            // new JSON format

            var handedness = $scope.json.equipment.handedness == "right" ? 1 : -1;

            gyr = _.map($scope.json.capture.calibratedSensorData.samples, function (sample) {

                var xyz = _.map(sample[2].split(','),  parseFloat);

                return {
                    timestamp: sample[0],
                    x: handedness * xyz[0],
                    y: handedness * xyz[1],
                    z: xyz[2]
                };
            });

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

            events = $scope.json.capture.activities[0].actions[0].eventMarkers;

            var event_names = [
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

            _.map(events, function (event) {
                event.name = event_names[event.eventType];
            });

            if (vel) {
                // apply dynamic calibration to velocity
                var start = _.findWhere(events, {'name': 'start of backstroke'});
                var transition = _.findWhere(events, {'name': 'start of forward stroke'});
                var impact = _.findWhere(events, {'name': 'impact'});

                // apply dynamic calibration to velocity
                var dt = transition.time - start.time;
                var x = -vel[transition.index].x / dt;
                var y = -vel[transition.index].y / dt;
                var z = -vel[transition.index].z / dt;
                _.each(vel, function (v, k) {
                    if (k >= start.index) {
                        var dt = v.timestamp - start.time;
                        v.x += x * dt;
                        v.y += y * dt;
                        v.z += z * dt;
                    }
                });

                pos = [];
                var sum = {
                    'timestamp': _.first(vel).timestamp,
                    'x': 0.0,
                    'y': 0.0,
                    'z': 0.0
                };
                _.each(vel, function (v, k) {
                    var dt = v.timestamp - sum.timestamp;
                    sum.timestamp = v.timestamp;
                    sum.x += v.x * dt;
                    sum.y += v.y * dt;
                    sum.z += v.z * dt;
                    pos.push(_.clone(sum));
                });

                // apply dynamic calibration to position
                dt = impact.time - start.time;
                x = (pos[start.index].x - pos[impact.index].x) / dt;
                y = (pos[start.index].y - pos[impact.index].y) / dt;
                z = (pos[start.index].z - pos[impact.index].z) / dt;
                _.each(pos, function (p, k) {
                    if (k >= start.index) {
                        var dt = p.timestamp - start.time;
                        p.x += x * dt;
                        p.y += y * dt;
                        p.z += z * dt;
                    }
                });
            }

            // TODO: calculate these metrics in the framework instead of here
            var backstroke_to_forward_stroke_speed_ratio = _.findWhere($scope.metrics, {'type': 'backstroke to forward stroke speed ratio'});
            if (backstroke_to_forward_stroke_speed_ratio) {
                $scope.metrics.push({
                    'type': 'forward stroke to backstroke speed ratio',
                    'value': 1.0 / backstroke_to_forward_stroke_speed_ratio.value,
                    'storageUnits': backstroke_to_forward_stroke_speed_ratio.storageUnits
                });
            }

            var impact = _.findWhere(events, {'name': 'impact'})
            var start = _.findWhere(events, {'name': 'start of backstroke'}) || _.findWhere(events, {'name': 'start of backswing'})
            var gyr_pre_impact = _.filter(gyr, function (it) { return it.timestamp >= start.time && it.timestamp <= impact.time; });

            var y_angular_velocity_peak_negative = _.min(_.pluck(gyr_pre_impact, 'y'));
            $scope.metrics.push({
                'type': 'y angular velocity peak negative',
                'value': y_angular_velocity_peak_negative,
                'storageUnits': 'radians/sec'
            });

            var y_angular_velocity_peak_positive =  _.max(_.pluck(gyr_pre_impact, 'y'));
            $scope.metrics.push({
                'type': 'y angular velocity peak positive',
                'value': y_angular_velocity_peak_positive,
                'storageUnits': 'radians/sec'
            });

            $scope.metrics.push({
                'type': 'y angular velocity peak ratio',
                'value': Math.abs(y_angular_velocity_peak_positive / y_angular_velocity_peak_negative),
                'storageUnits': 'ratio'
            });

            $scope.metrics.push({
                'type': 'x angular velocity peak',
                'value': _.max(_.map(_.pluck(gyr_pre_impact, 'x'), Math.abs)),
                'storageUnits': 'radians/sec'
            });

            $scope.metrics.push({
                'type': 'x angular velocity impact',
                'value': _.last(gyr_pre_impact).x,
                'storageUnits': 'radians/sec'
            });

            $scope.metrics.push({
                'type': 'z angular velocity peak',
                'value': _.max(_.map(_.pluck(gyr_pre_impact, 'z'), Math.abs)),
                'storageUnits': 'radians/sec'
            });

            $scope.metrics.push({
                'type': 'z angular velocity impact',
                'value': _.last(gyr_pre_impact).z,
                'storageUnits': 'radians/sec'
            });

            $scope.metrics.push({
                'type': 'ideal backstroke length',
                'value': $scope.metric('stroke speed at impact').value * 0.5 * $scope.metric('forward stroke time').value,
                'storageUnits': 'meters'
            });

            $scope.metrics.push({
                'type': 'backstroke length ratio',
                'value': $scope.metric('backstroke length').value / $scope.metric('ideal backstroke length').value,
                'storageUnits': 'meters'
            });

            $scope.metrics.push({
                'type': 'backstroke length to rotation ratio',
                'value': Math.abs($scope.metric('backstroke length').value / $scope.metric('backstroke rotation').value * 39.3701),
                'storageUnits': 'inches/deg'
            });

        } else {
            $log.warn('upload format not recognized');
        }

        $scope.valid = true;

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
            acc = _.map(_.zip(_.slice(vel, 0, vel.length - 1), _.slice(vel, 1)), function (pair) {
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

            /* noisy acceleration
            data.push({
                x: _.pluck(acc, 'timestamp'),
                y: _.map(_.map(_.pluck(acc, 'x'), function (it) { return it * 2.23694; }), _.partial(limit, 20)),
                name: 'acc (mph/s)',
                type: 'scatter',
                yaxis: 'y2'
            });
            */

            // smooth acceleration
            var impact = _.findWhere(events, {'name': 'impact'});
            _.each(['x', 'y', 'z'], function (component) {
                var alpha = Math.exp(-1 / 50);
                var beta = 1.0 - alpha;

                // forward filter
                var forward = [];
                var value = 0.0;
                for (var index = 0; index < impact.index; ++index) {
                    value = alpha * value + beta * acc[index][component];
                    forward.push(value);
                }
                // backward filter
                value = acc[impact.index - 1][component];
                for (var index = impact.index - 1; index >= 0; --index) {
                    value = alpha * value + beta * acc[index][component];
                    acc[index][component] = 0.5 * (value + forward[index]);
                }
            });

            data.push({
                x: _.pluck(acc, 'timestamp'),
                y: _.map(_.map(_.pluck(acc, 'x'), function (it) { return it * 2.23694; }), _.partial(limit, 20)),
                name: 'acc (mph/s)',
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
        }

        if (pos) {
            data.push({
                x: _.pluck(pos, 'timestamp'),
                y: _.map(_.pluck(pos, 'x'), inches),
                name: 'position (in)',
                type: 'scatter',
                yaxis: 'y2'
            });
        }
        
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

        shapes.push({
            'type': 'rect',
            'xref': 'paper',
            'x0': 0.0,
            'y0': -5.0,
            'x1': 1.0,
            'y1': 5.0,
            'line': {'width': 0.0},
            'fillcolor': 'rgba(0, 0, 0, 0.1)',
        });
        
        var y = -1;
        
        var annotations = _.map(events, function (event) {
            ++y;
            return {
                'yref': 'paper',
                'x': event.time,
                'y': events.length == 1 ? 1 : y / (events.length - 1),
                'text': event.name,
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

.filter('degrees', function () {
    return function (rad) {
        return rad * 180.0 / Math.PI;
    };
})

.filter('timestamp', function () {
    return function (t) {
        return t ? moment.utc(t).format('YYYY-MM-DD HH:mm:ss[Z]') : '';
    };
})

.filter('mps_to_mph', function () {
    return function (x) {
        return x ? x * 2.23694 : '';
    };
})

.filter('meters_to_inches', function () {
    return function (x) {
        return x ? x * 39.3701 : '';
    };
})

.filter('seconds_to_inches_per_mph', function () {
    return function (x) {
        return x? x * 63360 / 3600 : '';
    };
})

;

