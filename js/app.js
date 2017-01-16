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

function Action(file, json) {
    this.file = file;
    this.json = json;
    this.gyr = [];
    this.acc = [];
    this.pos = [];
    this.vel = [];
    this.events = [];
    this.metrics = [];
    this.valid = false;

    this._metric = function (type) {
        return _.findWhere(this.metrics, {'type': type}) || {};
    };

    this.metric = function (type) {
        return this._metric(type).value;
    };

    this.event = function (name) {
        return _.findWhere(this.events, {'name': name}) || {};
    };

    var self = this;

    if (json.SensorCalibratedData) {
        // old JSON format
        this.gyr = _.map(json.SensorCalibratedData, function (sample) {
            return {
                timestamp: sample.TimeStamp,
                x: sample.gX,
                y: sample.gY,
                z: sample.gZ
            }
        });

        this.vel = _.map(json.SensorIntegratedData, function (sample) {
            return {
                timestamp: sample.TimeStamp,
                x: sample.vX,
                y: sample.vY,
                z: sample.vZ,
            }
        });

        this.pos = _.map(json.SensorIntegratedData, function (sample) {
            return {
                timestamp: sample.TimeStamp,
                x: sample.pX,
                y: sample.pY,
                z: sample.pZ,
            }
        });

        this.valid = true;

    } else if (json.capture) {
        // new JSON format

        var handedness = json.equipment.handedness == "right" ? 1 : -1;

        this.gyr = _.map(json.capture.calibratedSensorData.samples, function (sample) {

            var xyz = _.map(sample[2].split(','),  parseFloat);

            return {
                timestamp: sample[0],
                x: handedness * xyz[0],
                y: handedness * xyz[1],
                z: xyz[2]
            };
        });

        _.each(json.capture.activities[0].actions[0].metricGroups, function (group) {
            _.each(group.metrics, function (metric) {
                if (metric.type == 'clubhead velocity vector') {
                    var dt = metric.samplingPeriod;
                    var k = -1;
                    self.vel = _.map(metric.values, function (value) {
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
                    self.metrics.push(metric);
                }
            });
        });

        this.events = json.capture.activities[0].actions[0].eventMarkers;

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

        _.each(this.events, function (event) {
            event.name = event_names[event.eventType];
        });

        if (this.vel) {
            // apply dynamic calibration to velocity
            var start = _.findWhere(this.events, {'name': 'start of backstroke'});
            var transition = _.findWhere(this.events, {'name': 'start of forward stroke'});
            var impact = _.findWhere(this.events, {'name': 'impact'});
            var dt = transition.time - start.time;
            var x = -this.vel[transition.index].x / dt;
            var y = -this.vel[transition.index].y / dt;
            var z = -this.vel[transition.index].z / dt;
            _.each(this.vel, function (v, k) {
                if (k >= start.index) {
                    var dt = v.timestamp - start.time;
                    v.x += x * dt;
                    v.y += y * dt;
                    v.z += z * dt;
                }
            });

            // differentiate velocity to get linear acceleration
            this.acc = _.map(_.zip(_.slice(this.vel, 0, this.vel.length - 1), _.slice(this.vel, 1)), function (pair) {
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

            // smooth acceleration
            var impact = this.event('impact');
            _.each(['x', 'y', 'z'], function (component) {
                var alpha = Math.exp(-1 / 10);
                var beta = 1.0 - alpha;

                // forward filter
                var forward = [];
                var value = 0.0;
                for (var index = 0; index < impact.index; ++index) {
                    value = alpha * value + beta * self.acc[index][component];
                    forward.push(value);
                }
                // backward filter
                value = _.sum(_.pluck(_.slice(self.acc, impact.index - 5, impact.index))) / 5;
                for (var index = impact.index - 1; index >= 0; --index) {
                    value = alpha * value + beta * self.acc[index][component];
                    self.acc[index][component] = 0.5 * (value + forward[index]);
                }

                // limit the acceleration magnitude after impact
                _.each(self.acc, function (it) {
                    if (it.timestamp > impact.time) {
                        it[component] = limit(0.5 * 9.81, it[component]);
                    }
                });
            });

            // integrate velocity to get position
            var sum = {
                'timestamp': _.first(this.vel).timestamp,
                'x': 0.0,
                'y': 0.0,
                'z': 0.0
            };

            this.pos = _.map(this.vel, function (v, k) {
                var dt = v.timestamp - sum.timestamp;
                sum.timestamp = v.timestamp;
                sum.x += v.x * dt;
                sum.y += v.y * dt;
                sum.z += v.z * dt;
                return _.clone(sum);
            });

            // apply dynamic calibration to position
            dt = impact.time - start.time;
            x = (this.pos[start.index].x - this.pos[impact.index].x) / dt;
            y = (this.pos[start.index].y - this.pos[impact.index].y) / dt;
            z = (this.pos[start.index].z - this.pos[impact.index].z) / dt;
            _.each(this.pos, function (p, k) {
                if (k >= start.index) {
                    var dt = p.timestamp - start.time;
                    p.x += x * dt;
                    p.y += y * dt;
                    p.z += z * dt;
                }
            });

            // TODO: calculate these metrics in the framework instead of here

            var impact = _.findWhere(this.events, {'name': 'impact'});
            var start = _.findWhere(this.events, {'name': 'start of backstroke'}) || _.findWhere(this.events, {'name': 'start of backswing'});
            var gyr_pre_impact = _.filter(this.gyr, function (it) { return it.timestamp >= start.time && it.timestamp <= impact.time; });

            var y_angular_velocity_peak_negative = _.min(_.pluck(gyr_pre_impact, 'y'));
            this.metrics.push({
                'type': 'y angular velocity peak negative',
                'value': y_angular_velocity_peak_negative,
                'storageUnits': 'radians/sec'
            });

            var y_angular_velocity_peak_positive =  _.max(_.pluck(gyr_pre_impact, 'y'));
            this.metrics.push({
                'type': 'y angular velocity peak positive',
                'value': y_angular_velocity_peak_positive,
                'storageUnits': 'radians/sec'
            });

            this.metrics.push({
                'type': 'y angular velocity peak ratio',
                'value': Math.abs(y_angular_velocity_peak_positive / y_angular_velocity_peak_negative),
                'storageUnits': 'ratio'
            });

            this.metrics.push({
                'type': 'x angular velocity peak',
                'value': _.max(_.map(_.pluck(gyr_pre_impact, 'x'), Math.abs)),
                'storageUnits': 'radians/sec'
            });

            this.metrics.push({
                'type': 'x angular velocity impact',
                'value': _.last(gyr_pre_impact).x,
                'storageUnits': 'radians/sec'
            });

            this.metrics.push({
                'type': 'z angular velocity peak',
                'value': _.max(_.map(_.pluck(gyr_pre_impact, 'z'), Math.abs)),
                'storageUnits': 'radians/sec'
            });

            this.metrics.push({
                'type': 'z angular velocity impact',
                'value': _.last(gyr_pre_impact).z,
                'storageUnits': 'radians/sec'
            });

            this.metrics.push({
                'type': 'backstroke length to rotation ratio',
                'value': Math.abs(this.metric('backstroke length') / this.metric('backstroke rotation') * 39.3701),
                'storageUnits': 'inches/deg'
            });

            // FIXME fixes a bug in the framework (remove this as soon as that bug is fixed)
            var peak_backstroke_speed = this._metric('peak backstroke speed');
            peak_backstroke_speed.value = _.max(_.map(_.slice(this.vel, start.index, transition.index), function (v) { return Math.abs(v.x); }));
            var peak_forward_stroke_speed = this._metric('peak forward stroke speed');
            var back_to_forward_stroke_speed = this._metric('backstroke to forward stroke speed ratio');

            var backstroke_to_forward_stroke_speed_ratio = this._metric('backstroke to forward stroke speed ratio');
            if (backstroke_to_forward_stroke_speed_ratio) {
                backstroke_to_forward_stroke_speed_ratio.value = peak_backstroke_speed.value / peak_forward_stroke_speed.value;
                this.metrics.push({
                    'type': 'forward stroke to backstroke speed ratio',
                    'value': peak_forward_stroke_speed.value / peak_backstroke_speed.value,
                    'storageUnits': backstroke_to_forward_stroke_speed_ratio.storageUnits
                });
            }

            this.metrics.push({
                'type': 'efficiency',
                'value': this.metric('backstroke length') / (this.metric('stroke speed at impact') * this.metric('forward stroke time')),
                'storageUnits': 'ratio'
            });
        }

        this.valid = true;
    }
}

// angular
angular.module("app", [])

.controller("main", function ($scope, $log, $http, $rootScope) {

    $scope.detail_report = false;
    $scope.actions = [];
    $scope.action = null;
    $scope.normalize_graphs = false;

    $scope.toggle_detail_report = function () {
        $scope.detail_report = !$scope.detail_report;
    };

    $scope.toggle_normalize_graphs = function () {
        $scope.normalize_graphs = !$scope.normalize_graphs;
        $scope.show();
    };

    $scope.trash = function (action) {
        _.pull($scope.actions, action);
        $scope.show($scope.action == action ? _.first($scope.actions) : $scope.action);
    };

    $scope.show = function (action) {
        $scope.action = action || $scope.action;

        document.getElementById('plotly').innerHTML = '';

        if ($scope.actions.length == 0) {
            return;
        }

        var data = [];

        _.each($scope.actions, function (action) {

            if (action.gyr) {
                var normalize = $scope.normalize_graphs ? $scope.action.metric('y angular velocity peak positive') / action.metric('y angular velocity peak positive') : 1.0;

                data.push({
                    x: _.pluck(action.gyr, 'timestamp'),
                    y: _.map(action.gyr, function (it) { return degrees(it.x) * normalize; }),
                    name: 'gyro x',
                    legendgroup: 'gyro x',
                    showlegend: action == $scope.action,
                    type: 'scatter',
                    yaxis: 'y1',
                    line: {
                        color: 'dodgerblue',
                        width: action == $scope.action ? 2 : 1
                    }
                });

                data.push({
                    x: _.pluck(action.gyr, 'timestamp'),
                    y: _.map(action.gyr, function (it) { return degrees(it.y) * normalize; }),
                    name: 'gyro y',
                    legendgroup: 'gyro y',
                    showlegend: action == $scope.action,
                    type: 'scatter',
                    yaxis: 'y1',
                    line: {
                        color: 'forestgreen',
                        width: action == $scope.action ? 2 : 1
                    }
                });

                data.push({
                    x: _.pluck(action.gyr, 'timestamp'),
                    y: _.map(action.gyr, function (it) { return degrees(it.z) * normalize; }),
                    name: 'gyro z',
                    legendgroup: 'gyro z',
                    showlegend: action == $scope.action,
                    type: 'scatter',
                    yaxis: 'y1',
                    line: {
                        color: 'firebrick',
                        width: action == $scope.action ? 2 : 1
                    }
                });
            }

            var normalize = $scope.normalize_graphs ? $scope.action.metric('peak forward stroke speed') / action.metric('peak forward stroke speed') : 1.0;

            if (action.acc) {
                data.push({
                    x: _.pluck(action.acc, 'timestamp'),
                    y: _.map(action.acc, function (it) { return it.x * 2.23694 * normalize; }),
                    name: 'acc (mph/s)',
                    legendgroup: 'acc',
                    showlegend: action == $scope.action,
                    type: 'scatter',
                    yaxis: 'y2',
                    line: {
                        color: 'darkorange',
                        width: action == $scope.action ? 2 : 1
                    }

                });
            }

            if (action.vel) {
                data.push({
                    x: _.pluck(action.vel, 'timestamp'),
                    y: _.map(action.vel, function (it) { return mph(it.x) * normalize; }),
                    name: 'speed (mph)',
                    legendgroup: 'speed',
                    showlegend: action == $scope.action,
                    type: 'scatter',
                    yaxis: 'y2',
                    line: {
                        color: 'darkblue',
                        width: action == $scope.action ? 2 : 1
                    }

                });
            }

            if (action.pos) {
                data.push({
                    x: _.pluck(action.pos, 'timestamp'),
                    y: _.map(action.pos, function (it) { return inches(it.x) * normalize; }),
                    name: 'position (in)',
                    legendgroup: 'position',
                    showlegend: action == $scope.action,
                    type: 'scatter',
                    yaxis: 'y2',
                    line: {
                        color: 'darkorchid',
                        width: action == $scope.action ? 2 : 1
                    }

                });
            }
        });

        var shapes = [{
            'type': 'rect',
            'xref': 'paper',
            'x0': 0.0,
            'y0': -5.0,
            'x1': 1.0,
            'y1': 5.0,
            'line': {'width': 0.0},
            'fillcolor': 'rgba(0, 0, 0, 0.1)',
        }];


        _.each($scope.actions, function (action) {
            _.each(action.events, function (event) {
                shapes.push({
                    'type': 'line',
                    'yref': 'paper',
                    'x0': event.time,
                    'y0': 0.0,
                    'x1': event.time,
                    'y1': 1.0,
                    'line': {
                        'width': action == $scope.action ? 1.0: 0.5,
                        'color': 'rgba(0, 0, 0, 0.5)'
                    }
                });
            });
        });

//        var y = -1;
//
//        var annotations = _.map($scope.action.events, function (event) {
//            ++y;
//            return {
//                'yref': 'paper',
//                'x': event.time,
//                'y': $scope.action.events.length == 1 ? 1 : y / ($scope.action.events.length - 1),
//                'text': event.name,
//                'showarrow': false,
//                'xanchor': 'center',
//
//            };
//        });

        var layout = {
            yaxis: {
                domain: [0.54, 1],
                title: 'deg/s'
            },
            yaxis2: {
                domain: [0, 0.46],
            },
            xaxis: {
                anchor: 'y2',
                range: [
                    _.min(_.map($scope.actions, function (action) { return action.event('start of backstroke').time; })) - 0.4,
                    _.max(_.map($scope.actions, function (action) { return action.event('impact').time; }))
                ]
            },
            shapes: shapes,
            // annotations: annotations
        };

        Plotly.newPlot('plotly', data, layout);
    };

    function upload(file, result) {
        var action = new Action(file, JSON.parse(result));
        $scope.actions.push(action);
        $scope.show(action);
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

.filter('replace', function () {
    return function (x, subs, repl) {
        repl = repl || '';
        return x.replace(subs, repl);
    };
})

;

