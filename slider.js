var mt = {};

(function (d3, mt) {
    "use strict";


    // ---- Helper functions


    function stopPropagation()
    {
        d3.event.stopPropagation();
    }

    function intervalIsBigEnough(from, until)
    {
        return from + 60 > until;
    }

    function show(node)
    {
        node.style("visibility", "visible");
    }

    function hide(node)
    {
        node.style("visibility", "hidden");
    }

    function invert(handler)
    {
        return (handler === UNTIL) ? FROM : UNTIL;
    }

    function d3EventMousePos(selection)
    {
        return d3.mouse(selection.node())[0];
        // return d3.event.offsetX || d3.event.layerX;
        // return Math.max(0, Math.min(width, d3.event.x));
    }


    // ---- Constants


    var FROM = 'from', UNTIL = 'until',

        MIN = 60, HOUR = 60 * MIN, DAY = 24 * HOUR,

        CONF = {
            axis: {
                height: 30
            },
            steps: [
                0,
                10 * MIN,
                30 * MIN,
                1 * HOUR,
                4 * HOUR,
                12 * HOUR,
                1 * DAY,
                4 * DAY,
                7 * DAY,
                30 * DAY
            ]
        },

        FORMATTERS = {
            pct: d3.format(".2%"),
            dateFromSecondsAgo: function (seconds) {
                if (0 == seconds) return 'now';
                return moment().subtract('seconds', seconds).format("h:mma - ll");
            },
            tick: function (seconds) {

                if (0 === seconds) {
                    return 'now';
                }

                if (seconds < 1 * MIN) {
                    return '-' + seconds + 's';
                }

                if (seconds < 1 * HOUR) {
                    return '-' + seconds / 60 + 'm';
                }

                if (seconds < 1 * DAY) {
                    return '-' + seconds / (60 * 60) + 'h';
                }

                return '-' + seconds / (60 * 60 * 24) + 'd';
            }
        };


    // ----


    mt.TimeSlider = function(id)
    {

        var

            axis,

            value,

            handles = {
                from: undefined,
                until: undefined
            },

            /**
             * The active handle
             */
            active = FROM,

            container,

            callbacks = {},

            width,

            axisScale,

            axisContainer,

            /**
             * The scale of the slider, it transforms the domain [0, 1] (a percentage of the slider) to the range of time/seconds ago
             * Is really a polylinear scale, so the domain is not just [0, 1] but a serie of intermediate numbers, as well as the range
             */
            scale = d3.scale.linear().clamp(true),

            drag = d3.behavior.drag(),

            /**
             * A boolean to know when there's a current dragging operation
             */
            dragging = false,

            mainDiv = d3.select(id),
            range = _(CONF.steps).sortBy().value(),
            domain = _.map(range, function (val, ind, range) { return ind ? ind/(range.length - 1) : 0; } );

        scale.rangeRound( range ).domain( domain );

        console.debug("domain", domain);
        console.debug("range", range);


        // Initial value
        value = value || {
            from: CONF.steps[3],
            until: range[0]
        };


        mainDiv.classed("time-slider", true);

        // tooltips
        var tooltipsContainer = mainDiv.append('div').attr("class", "tooltips");

        var tooltips = {
            from: tooltipsContainer.append('div').attr("class", FROM),
            until: tooltipsContainer.append('div').attr("class", UNTIL),
            mouse: tooltipsContainer.append('div').attr("class", 'mouse')
        };

        var tooltipTexts = {
            from: tooltips.from.append('span').attr("class", "dt"),
            until: tooltips.until.append('span').attr("class", "dt")
        };

        // Links to customize the moment
        // tooltips.from.append('a').text('custom');
        // tooltips.until.append('a').text('custom');

        // hover DIV
        var sliderDiv = mainDiv.append('div').attr("class", "slider");

        // receive clicks in the main area so it's easy to select times.
        mainDiv.on('click', onClick);

        // tooltips control
        mainDiv.on('mousemove', function () {

            if (!dragging)
            {
                var pos = d3EventMousePos(mainDiv);

                active = getActiveHandle(pos);

                tooltips[active].classed('active', true);
                tooltips[invert(active)].classed('active', false);

                handles[active].classed('active', true);
                handles[invert(active)].classed('active', false);

                // write the tentative moment in the corresponding tooltip
                updateMouseTooltip(pos);
            }

        }).on('mouseenter', function () {

            //show(tooltips['mouse']);

        }).on('mouseleave', function () {

            tooltips[FROM].classed('active', false);
            tooltips[UNTIL].classed('active', false);

            handles[FROM].classed('active', false);
            handles[UNTIL].classed('active', false);

            updateTooltipsText();
            hide(tooltips['mouse']);
        });


        // main DIV container
        var area = sliderDiv.append('div').classed("area", true);

        // cache the slider width
        width = parseInt(area.style("width"), 10);

        // from slider handle
        handles[FROM] = area.append("a")
            .attr("class", "handle from")
            .on("click", stopPropagation)
            .call(drag);

        // until slider handle
        handles[UNTIL] = area.append("a")
            .attr("class", "handle until")
            .on("click", stopPropagation)
            .call(drag);

        // interval marker
        var slice = area.append('div').classed("slice", true);

        // position the left handler at the initial value
        handles[FROM].style("right", FORMATTERS.pct(scale.invert(value[ FROM ])));

        // position the right handler at the initial value
        handles[UNTIL].style("right", FORMATTERS.pct(scale.invert(value[ UNTIL ])));

        // position the range rectangle at the initial value
        slice.style({
            left: (100 - parseFloat(FORMATTERS.pct(scale.invert(value[ FROM ])))) + "%",
            right: FORMATTERS.pct(scale(value[ UNTIL ]))
        });

        updateTooltipsText();

        createAxis(mainDiv);


        // ---- Events


        drag.on("drag", onDrag);
        drag.on("dragstart", onDragStart);
        drag.on("dragend", onDragEnd);

        sliderDiv.on("click", onClick);

        // Adjust all things after a window resize
        d3.select(window).on('resize', function () {
            width = mainDiv[0][0].clientWidth;
            axisScale.range(getAxisRange());
            axisContainer.attr("width", width);
            axisContainer.transition().call(axis);
        });


        // ---- Private functions


        function nearestHandle(pos)
        {
            var currLpos = val2left(value[FROM]),
                currRpos = val2left(value[UNTIL]),
                handle = UNTIL;

            if (Math.abs(pos - currLpos) < Math.abs(pos - currRpos)){
                handle = FROM;
            }

            return handle;
        }

        function posIsAtTheRightOfHandle(handle, pos)
        {
            return pos > val2left(value[handle]);
        }

        function getActiveHandle(pos)
        {

            // the active handle is the one at the left of the mouse
            return posIsAtTheRightOfHandle(UNTIL, pos) ? UNTIL : FROM;

            // Another option is to return the nearest handle
            // return nearestHandle(pos);
        }

        function updateTooltipsText()
        {
            tooltipTexts[FROM].text( FORMATTERS.dateFromSecondsAgo(value[FROM]) );
            tooltipTexts[UNTIL].text( FORMATTERS.dateFromSecondsAgo(value[UNTIL]) );
        }

        function updateMouseTooltip(pos)
        {
            tooltipTexts[active].text( FORMATTERS.dateFromSecondsAgo(pos2val(pos)) );

            /*tooltips.mouse
                .style("left", FORMATTERS.pct( pos / width ))
                .text(val);*/

        }

        function getAxisRange() {
            return _.chain(scale.domain())
                .map(function (val) { return val * width; })
                .reverse()
                .value();
        }

        function createAxis(container)
        {
            axis = d3.svg.axis()
                .ticks(Math.round(width / 100))
                .tickFormat(FORMATTERS.tick)
                .tickValues(CONF.steps)
                .tickPadding(6)
                .tickSize(8)
                .orient("bottom");

            var axis_domain = scale.range(),
                axis_range = getAxisRange();

            console.log("axis domain", axis_domain);
            console.log("axis range", axis_range);

            axisScale = scale.copy()
                .domain(axis_domain)
                .range(axis_range);
            axis.scale(axisScale);

            // Create SVG axis container
            axisContainer = container.append("svg")
                .classed("axis", true)
                .on("click", stopPropagation);

            // For now we also accept clicks on the svg, to make it easy to use
            axisContainer.on('click', onClick);

            // axis

            axisContainer.attr({
                    width: width,
                    height: CONF.axis.height
                })
                .call(axis);
        }

        function interpolator (oldVal, newVal) {
            return function () {
                return d3.interpolate(oldVal, newVal);
            };
        }

        function val2left (val) {
            return (1 - val2pct(val)) * width;
        }

        function val2right (val) {
            return val2pct(val) * 100 / width;
        }

        function val2pct (val) {
            return scale.invert(val);
        }

        function pos2val (pos) {
            return scale((width - pos) / width);
        }

        /**
         * Moves the slider {handle} to the position {pos}
         */
        function moveHandle(handle, pos)
        {
            var newValue = pos2val(pos),
                currentValue = value[handle];
            console.debug('moving handle %s to position: %f/%2f, value: %f', handle, pos, (width - pos) / width, newValue);

            if (currentValue !== newValue) {
                var oldPos = FORMATTERS.pct(val2pct(currentValue)),
                    newPos = FORMATTERS.pct(val2pct(newValue));

                // set the new handler value
                value[handle] = newValue;

                // disallow intervals of less than 1 minute
                if ( !intervalIsBigEnough(value[FROM], value[UNTIL]) ) {
                    console.error('problem', value, value[ UNTIL ] + 60);

                    //restore the previous handler value and cancel the move
                    value[handle] = currentValue;
                    return;
                }

                console.log("New value {from:%s, until:%s} handler:%s. New pos %s", value.from, value.until, handle, newPos);

                if ( UNTIL === handle )
                {
                    slice.transition().styleTween("right", interpolator(oldPos, newPos))
                }

                if (FROM === handle)
                {
                    var newRight = 100 - parseFloat(newPos) + "%";
                    var oldRight = 100 - parseFloat(oldPos) + "%";

                    slice.transition().styleTween("left", interpolator(oldRight, newRight));
                }

                handles[handle].transition().styleTween("right", interpolator(oldPos, newPos));
            }

            updateTooltipsText();
        }

        function notifyChange()
        {
            if (_.has(callbacks, 'change')) {
                callbacks.change(value);
            }
        }

        function onClick()
        {
            var pos = d3EventMousePos(mainDiv),
                active = getActiveHandle(pos);

            // moving the closest handler to the position _pos_
            moveHandle(active, pos);
            notifyChange();
            stopPropagation();
        }

        function onDrag()
        {
            // console.debug("dragged handler %s", active);
            moveHandle(active, d3EventMousePos(mainDiv));
        }

        function onDragStart()
        {
            dragging = true;

            var target = d3.select(d3.event.sourceEvent.target);

            if ( target.classed('from') ) {
                active = FROM;

            } else if ( target.classed('until') ) {
                active = UNTIL;

            } else throw "error 434";

            console.warn("Drag started on handler %s", active);
        }

        function onDragEnd()
        {
            dragging = false;
            notifyChange();
        }


        // --- API


        this.value = function(set) {
            if (!arguments.length) return value;
            value = set;
            return this;
        };

        this.onChange = function(callback) {
            if (arguments.length) {
                callbacks.change = callback;
            }
            return this;
        };

    }

}(d3, mt));
