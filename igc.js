/*
  The MIT License (MIT)

  Copyright (C) 2014  Joseph W. J. Roberts

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/

/*
IGC files are parsed as defined in Ian Forster-Lewis's document at:
http://carrier.csi.cam.ac.uk/forsterlewis/soaring/igc_file_format/igc_format_2008.html

Some Lat/Lon calculation code is adapted from Chris Veness's work at:
http://www.movable-type.co.uk/scripts/latlong.html
*/

var flight;

var scales = {'vario': {'min': -10,
                        'max':  10},
              'alt'  : {'min': 0,
                        'max': 5000/3.2808399}
             };

/////////////////
//Begin UI code//
/////////////////

$("li").click(function() {
    link = "#" + $(this).attr('id');
    page = link.split("-")[0]+"-page";

    //hide other pages and show the linked one
    $("div[id*='-page']").hide();
    $(page).show();

    //set all links inactive and the clicked on active
    $("li[id*='-link']").removeClass("active");
    $(link).addClass("active");

    if(link=="#about-link")
        $("#file-selector").hide();
    else
        $("#file-selector").show();

    if(link=="#stats-link")
        displayStatistics(flight);
    if(link=="#map-link")
        google.maps.event.trigger(map, "resize");
});

//special case for the brand
$(".navbar-brand").click(function() {
    $("#home-link").click();
});

function displayStatistics(flight) {
    //Fill in the stats page with all sorts of interesting information
    //TODO

    var options = {'legend': {position: 'none'},
                   'chartArea': {'width': '80%', 'height': '80%'},
                   'vAxis': {'textPosition': 'out'}
                   }
    var speed_options = options;
    speed_options['title'] = 'Ground Speed';
    var speed_data  = new google.visualization.DataTable();
    speed_data.addColumn('datetime', 'Time')
    speed_data.addColumn('number', 'Ground Speed')
    for(var i=0; i<flight.trace.length; i+=3){
        speed_data.addRow([flight.trace[i].time, flight.trace[i].groundSpeed])
    }
    speed_chart = new google.visualization.LineChart(document.getElementById('speed_chart'));
    speed_chart.draw(speed_data, speed_options);

    var alt_options = options;
    alt_options['title'] = ['Altitude'];
    var alt_data  = new google.visualization.DataTable();
    alt_data.addColumn('datetime', 'Time')
    alt_data.addColumn('number', 'Altitude')
    for(var i=0; i<flight.trace.length; i+=3){
        alt_data.addRow([flight.trace[i].time, flight.trace[i].alt*3.2808399])
    }
    alt_chart = new google.visualization.LineChart(document.getElementById('alt_chart'));
    alt_chart.draw(alt_data, alt_options);
}


//placeholder scale bar code
function drawScale(type){
    var canvas = $('#sidebar').children('canvas')[0];
    var ctx = canvas.getContext('2d');
    var w = $('#sidebar').width();
    var h = $('#sidebar').height();

    ctx.canvas.width = w;
    ctx.canvas.height = h;
    ctx.font = "20px Arial";

    var steps = 10;
    var dh = h/steps;

    for (var y = 0; y < h; y+=dh)
    {
        var a = scales[type].max - ((scales[type].max - scales[type].min) * y/(h-1));
        ctx.fillStyle = colourMap(a, type);
        ctx.fillRect(0, y, w, dh);

        var txt = String(Math.round(a))
        if(type=="vario")
            txt += "kts"
        else if(type=="alt")
            txt += "m"
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(txt, 5, y+dh/2, 40);
    }
}

////////////////////
//Begin IGC parser//
////////////////////

metadataMap = {
    HFDTE: "Flight Date",
    HFFXA: "Fix Accuracy",
    HFPLTPILOTINCHARGE: "Pilot (P1)",
    HFPLTPILOT: "Pilot (P1)",
    HFCM2CREW2: "Pilot (P2)",
    HFGTYGLIDERTYPE: "Glider Type",
    HFGIDGLIDERID: "Glider Reg",
    HFDTM100GPSDATUM: "GPS Datum",
    HFFTYFRTYPE: "Logger Type",
    HFRFWFIRMWAREVERSION: "Firmware Version",
    HFRHWHARDWAREVERSION: "Hardware Version",
    HFGPS: "GPS unit",
    HFPRSPRESSALTSENSOR: "Pressure Sensor",
    HFCIDCOMPETITIONID: "Competition Number",
    HFCCLCOMPETITIONCLASS: "Competition Class",
    HFTZNTIMEZONE: "Timezone"
 }

function fileHandler(files) {
    fr = new FileReader();
    fr.onload = function(e) { processIgcFile(e.target.result) }
    file = files[0];
    console.log("Parsing " + file.name);

    fr.readAsText(file)
}

function parseIgcLine(line){
    //TODO handle tasks (C records)
    //TODO handle events (E records)
    //TODO handle B record extensions (I records)
    //TODO handle K records (defined by a J record)
    if (line[0]=="B" && line[24]=="A"){
        //we're dealing with a valid location record
        timeStr = line.slice(1, 7);
        latStr = line.slice(7, 15);
        lonStr = line.slice(15, 24);
        baroAltStr = line.slice(25, 30);
        gpsAltStr = line.slice(30, 35);
        return new Loc(timeStr, latStr, lonStr, baroAltStr, gpsAltStr);
    } else if (line[0]=="H") {
        // We're dealing with some metadata
        if (line.indexOf(':') != -1) {
            line = line.split(':');
        } else {
            // Special cases such as HFDTE & HFFXA
            line = [line.substring(0, 5), line.substring(5)];
        }
        line[0] = line[0].toUpperCase();

        if (!Boolean(metadataMap[line[0]])) {
            return 0;
        }

        return new Meta(metadataMap[line[0]], line[1]);
    }

    // Default return, ignores the line
    return 0;
}

function processIgcFile(file){

    lines = file.split("\n");
    flight = new Flight();
    for(var i=0; i<lines.length; i++){
        line = parseIgcLine(lines[i]);
        if(line.type=="loc")
            flight.trace.push(line);
        else if(line.type=="meta")
            flight.metadata.push(line);
    }
    console.log("Done\n");

    console.log("Computing Statistics");
    flight.computeStatistics();
    console.log("Done\n");

    console.log("Plotting trace");
    plotTrace(flight.trace, 'alt');
    fitTrace();
    console.log("Done\n");

    if($('#stats-link').hasClass('active'))
        displayStatistics(flight);
}

function Flight() {
    this.trace = [];
    this.metadata = [];
}

Flight.prototype.computeStatistics = function() {
    //Runs all the statistic functions available with the given data
    this.computeSpeeds();
    this.findStartFinish();
    this.findMaxHeightGain();
}

Flight.prototype.computeSpeeds = function() {
    //Computes horizontal and vertical speed, and track at each datapoint
    //Speed is measured at each Loc to the next, therefore final Loc has no speed value (0)
    //Horizontal speed is smoothed with three sample moving average to counter noise in thermals

    var t, s, dh;
    var temp_speed = [];
    for(var i=0; i<(this.trace.length-1); i++){
        t = this.trace[i].calcDt(this.trace[i+1])
        s = this.trace[i].calcDistance(this.trace[i+1])
        dh = this.trace[i+1].alt - this.trace[i].alt;
        temp_speed.push((s/t) / 1000 * 60 * 60); //In Km/h
        this.trace[i].vario = (dh/t) * 1.94384449; //In kts
        this.trace[i].track = this.trace[i].calcBearing(this.trace[i+1]);
    }
    this.trace[this.trace.length-1].speed = 0;

    for(var i=1; i<(this.trace.length-2); i++){
        this.trace[i].groundSpeed = (temp_speed[i-1] + temp_speed[i] + temp_speed[i+1])/3;
    }
}
Flight.prototype.findStartFinish = function() {
    //Detect the start and finish times of the flight, as well as when the launch finishes
    //TODO
}

Flight.prototype.findMaxHeightGain = function() {
    //Finds the maximum height gain (eg, for height badge claims)
    //TODO
}

function Loc(timeStr, latStr, lonStr, baroAltStr, gpsAltStr){
    this.type = "loc";

    this.timeStr = timeStr;
    this.latStr = latStr;
    this.lonStr = lonStr;
    this.baroAltStr = baroAltStr;
    this.gpsAltStr = gpsAltStr;

    this.parsePosStrings();
    this.parseAltStrings();
    this.parseTimeString();
}

Loc.prototype.parsePosStrings = function() {
    //parses latStr and lonStr into nice floats

    //lat
    var minutes = Number(this.latStr.slice(-6, -1)/1000)
    var degrees = Number(this.latStr.slice(0, -6))
    var sign = (this.latStr.slice(-1)=="N") ? 1 : -1

    this.lat = sign * (degrees + minutes/60);

    //lon
    minutes = Number(this.lonStr.slice(-6, -1)/1000)
    degrees = Number(this.lonStr.slice(0, -6))
    sign = (this.lonStr.slice(-1)=="E") ? 1 : -1

    this.lon = sign * (degrees + minutes/60);
}

Loc.prototype.parseAltStrings = function() {
    //parses gpsAltStr and baroAltStr into nice numbers, and consolidates them

    this.gpsAlt = Number(this.gpsAltStr);
    this.baroAlt = Number(this.baroAltStr);

    //TODO intelligently consolidate the two altitude sources (eg, if one is disconnected)
    this.alt = this.gpsAlt;
}

Loc.prototype.parseDateString = function() {
    //Parses the HFDTE date string in the form 'DDMMYY'

    var day = Number(this.dateString.slice(0, 2));
    var month = Number(this.dateString.slice(2, 4)) - 1; //JS months are 0 indexed
    var halfYear = Number(this.dateString.slice(4, 6));
    //We have to make a guess at which century the flight was in
    //Dear intrepid glider pilots of the year 2080+,
    //Thanks to the wonderful foresight of the FAI, you will need to change the next line
    var fullYear = (halfYear > 80) ? halfYear+1900 : halfYear + 2000;

    this.date = new Date(fullYear, month, day);
}

Loc.prototype.parseTimeString = function() {
    //Parses a 'B Record' timestring, in the format 'HHMMSS'
    this.time = new Date();
    this.time.setHours(Number(this.timeStr.slice(0,2)));
    this.time.setMinutes(Number(this.timeStr.slice(2, 4)));
    this.time.setSeconds(Number(this.timeStr.slice(4, 6)));
}

Loc.prototype.calcDistance = function(otherLoc) {
    //Computes the distance in meters from this to otherLoc
    //Adapted from "Spherical Law of Cosines" code at http://www.movable-type.co.uk/scripts/latlong.html
    var φ1 = this.lat.toRadians(), φ2 = otherLoc.lat.toRadians()
    var Δλ = (otherLoc.lon-this.lon).toRadians()
    var R = 6371000; // gives d in km
    var d = Math.acos( Math.sin(φ1)*Math.sin(φ2) + Math.cos(φ1)*Math.cos(φ2) * Math.cos(Δλ) ) * R;
    return d;
}

Loc.prototype.calcDt = function(otherLoc) {
    //Calculates the difference in time between two points in seconds
    t1 = this.time;
    t2 = otherLoc.time;
    dt = Math.floor((t2 - t1)/1000);
    return dt
}

Loc.prototype.calcBearing = function(otherLoc) {
    //Calculates the bearing from this to otherLoc
    //Adapted from "Bearing" code at http://www.movable-type.co.uk/scripts/latlong.html
    var φ1 = this.lat.toRadians(), φ2 = otherLoc.lat.toRadians()
    var Δλ = (otherLoc.lon-this.lon).toRadians()
    var y = Math.sin(Δλ) * Math.cos(φ2);
    var x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    var bearing = Math.atan2(y, x).toDegrees();

    //normalize for 0->360 (as opposed to -180->+180
    bearing = (bearing < 0) ? (360 + bearing) : bearing;

    return bearing
}

function Meta(title, data){
    this.type = "meta";
    this.title = title;
    this.data = data;
}

////////////////////
//Begin gmaps code//
////////////////////

var map;
var polyline=[];

function initialize() {
    var mapOptions = {
        zoom: 6,
        center: new google.maps.LatLng(54.4, -4.5),
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        disableDefaultUI: true,
        mapTypeControl: true,

    };
    map = new google.maps.Map(document.getElementById('map-page'),
        mapOptions);
}

google.maps.event.addDomListener(window, 'load', initialize);

function plotTrace(trace, shading) {
    //Plots a trace as produced by the IGC parser

    //Clear any previous trace
    if(polyline.length){
        for(var i=0; i<polyline.length; i++)
            polyline[i].setMap(null);
        polyline = [];
    }


    if(shading[0]=="#"){
        var path = []
        for(var i=0; i<trace.length-1; i+=1){
            path.push(new google.maps.LatLng(trace[i].lat, trace[i].lon))
        }

        polyline = [ new google.maps.Polyline({
                         path: path,
                         strokeColor: shading,
                         strokeOpacity: 1.0,
                         strokeWeight: 3})
                   ];
        polyline[0].setMap(map);

    }
    else{
        for(var i=0; i<trace.length-1; i+=1){
            polyline.push(new google.maps.Polyline({
                              path: [new google.maps.LatLng(trace[i].lat, trace[i].lon),
                                     new google.maps.LatLng(trace[i+1].lat, trace[i+1].lon)],
                              strokeColor: colourMap(trace[i][shading], shading),
                              strokeOpacity: 1.0,
                              strokeWeight: 3
                          }));
            polyline[i].setMap(map);
        }
        drawScale(shading)
    }
};

function fitTrace(){
    var bounds = new google.maps.LatLngBounds();

    for(var i=0; i<polyline.length; ++i){
        polyline[i].getPath().forEach(function(latLng) {
            bounds.extend(latLng);
        });
    }

    map.fitBounds(bounds);
};

//////////////////////////
//Colour scale functions//
//////////////////////////

function colourMap(value, type) {

    // Map to a 0-1 range
    var a = (value - scales[type].min)/(scales[type].max - scales[type].min);
    a = (a < 0) ? 0 : ((a > 1) ? 1 : a);

    if(type=='vario'){
        // Scrunch the green/cyan range in the middle
        var sign = (a < .5) ? -1 : 1;
        a = sign * Math.pow(2 * Math.abs(a - .5), .35)/2 + .5;
    }

    // Linear interpolation between the cold and hot
    var h0 = 259;
    var h1 = 12;
    var h = (h0) * (1 - a) + (h1) * (a);

    return pusher.color("hsv", h, 75, 90).hex6();
};

/////////////////////////////////////////////////////////
//Math extensions for Geodesy calcs (from Chris Veness)//
/////////////////////////////////////////////////////////

/** Extend Number object with method to convert numeric degrees to radians */
if (typeof Number.prototype.toRadians == 'undefined') {
    Number.prototype.toRadians = function() { return this * Math.PI / 180; }
}

/** Extend Number object with method to convert radians to numeric (signed) degrees */
if (typeof Number.prototype.toDegrees == 'undefined') {
    Number.prototype.toDegrees = function() { return this * 180 / Math.PI; }
}
