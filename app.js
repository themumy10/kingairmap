






















let flightPath;
let api = {
  fixedZoom: true,
  pan: true,
  maxZoom: 15
};
let plane;
let line;


function startAirportService (
  centerLong, centerLat, flightPathSent){




flightPath=flightPathSent;




mapboxgl.accessToken =
  "pk.eyJ1IjoibXNhaGluZ2lyYXkiLCJhIjoiY2t6OXFpbjB5MGxzNjJ1bzF4cnBsZm9rZiJ9.Q29x7rlXQlOQ2iSF61Y20Q";

const map = new mapboxgl.Map({
  container: "map",
  projection: "globe",
  style: "mapbox://styles/msahingiray/cl0h7m7na002d14p9nbsb2yo8",
  zoom: 1.9466794621990684,
  center: { lng: centerLat, lat: centerLong },
  pitch: 70,
  bearing: 0,
});

window.map = map

map.on("load", async () => {
  mapboxgl.restoreNow();
});

map.on('style.load', function () {
  add3D();
  map.addLayer({
    id: 'custom_layer',
    type: 'custom',
    renderingMode: '3d',
    onAdd: async function (map, mbxContext) {
      // we can add Threebox to mapbox to add built-in mouseover/mouseout and click behaviors
      window.tb = new Threebox(
        map,
        map.getCanvas().getContext('webgl'),
        {
          realSunlight: true,
          enableSelectingObjects: true, //change this to false to disable 3D objects selection
          enableTooltips: true, // change this to false to disable default tooltips on fill-extrusion and 3D models
        }
      );
      tb.altitudeStep = 1;
      tb.setSunlight(new Date(2021, 0, 18, 12));
      let sphereTemplate = tb.sphere(
        {
          radius: 500,
          units: 'meters',
          sides: 20,
          color: 'purple',
          material: 'MeshToonMaterial'
      
        }
      )
  
      let options = {
        obj: './models/plane.glb',
        type: 'gltf',
        scale: 1,
        rotation: { x: 90, y: 0, z: 0 },
        anchor: 'center',
        bbox: false
      }

      if (api.fixedZoom) options.fixedZoom = api.maxZoom;

      await tb.loadObj(options, async function (model) {
        plane = model
          .setCoords(38.78472222, 38.27694444,);
        plane.setRotation({ x: 0, y: 0, z: 135 })


        plane.castShadow = true;
        tb.add(plane);
      })


      // for best performance, clone the template sphere for each point in randomPoint
      flightPath.geometry.coordinates.forEach(function (pt) {

        let newSphere = sphereTemplate
          .duplicate()
          .setCoords(pt);
        newSphere.addTooltip('WPT', true, newSphere.anchor, true, 2);

        tb.add(newSphere);

      })
      // kick off the animations
      await playAnimations(flightPath);




    },

    render: function (gl, matrix) {
      tb.update();
    }
  });

});


}




const add3D = () => {
  // add map 3d terrain and sky layer and fog
  // Add some fog in the background
  map.setFog({
    range: [0.5, 10],
    color: "white",
    "horizon-blend": 0.2,
  });

  // Add a sky layer over the horizon
  map.addLayer({
    id: "sky",
    type: "sky",
    paint: {
      "sky-type": "atmosphere",
      "sky-atmosphere-color": "rgba(85, 151, 210, 0.5)",
    },
  });

  // Add terrain source, with slight exaggeration
  map.addSource("mapbox-dem", {
    type: "raster-dem",
    url: "mapbox://mapbox.terrain-rgb",
    tileSize: 512,
    maxzoom: 14,
  });
  map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
};

const playAnimations = async (trackGeojson) => {
  return new Promise(async (resolve) => {
    // add a geojson source and layer for the linestring to the map
    addPathSourceAndLayer(trackGeojson);

    // get the start of the linestring, to be used for animating a zoom-in from high altitude
    var targetLngLat = {
      lng: trackGeojson.geometry.coordinates[0][0],
      lat: trackGeojson.geometry.coordinates[0][1],
    };

    // animate zooming in to the start point, get the final bearing and altitude for use in the next animation
    const { bearing, altitude } = await flyInAndRotate({
      map,
      targetLngLat,
      duration:  7000,
      startAltitude: 3000000,
      endAltitude: 50000,
      startBearing: 0,
      endBearing: -20,
      startPitch: 40,
      endPitch: 50,

    });
    var options = {
      path: trackGeojson.geometry.coordinates,
      duration: 60000
    }
    let lineGeometry = options.path;
    // create and add line object
    line = tb.line({
      geometry: lineGeometry,
      width: 5,
      color: 'steelblue'
    })

    tb.add(line, 'trackLineName');

    // start the truck animation with above options, and remove the line when animation ends
    plane.followPath(
      options,
      function () {
        //   tb.remove(line);
      }
    );
    // follow the path while slowly rotating the camera, passing in the camera bearing and altitude from the previous animation
    await animatePath({
      map,
      duration: 60000,
      path: trackGeojson,
      startBearing: bearing,
      startAltitude: altitude,
      pitch: 30,

    });


    // get the bounds of the linestring, use fitBounds() to animate to a final view
    const bounds = turf.bbox(trackGeojson);
    map.fitBounds(bounds, {
      duration: 3000,
      pitch: 30,
      bearing: 0,
      padding: 120,
    });

    setTimeout(() => {
      resolve()
    }, 10000)
  })
};

const addPathSourceAndLayer = (trackGeojson) => {
  // Add a line feature and layer. This feature will get updated as we progress the animation
  map.addSource("line", {
    type: "geojson",
    // Line metrics is required to use the 'line-progress' property
    lineMetrics: true,
    data: trackGeojson,
  });
  map.addLayer({
    id: "line-layer",
    type: "line",
    source: "line",
    paint: {
      "line-color": "rgba(0,0,0,0)",
      "line-width": 9,
      "line-opacity": 0.8,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });

  map.addSource("start-pin-base", {
    type: "geojson",
    data: createGeoJSONCircle(trackGeojson.geometry.coordinates[0], 0.04)
  });

  map.addSource("start-pin-top", {
    type: "geojson",
    data: createGeoJSONCircle(trackGeojson.geometry.coordinates[0], 0.25)
  });

  map.addSource("end-pin-base", {
    type: "geojson",
    data: createGeoJSONCircle(trackGeojson.geometry.coordinates.slice(-1)[0], 0.04)
  });

  map.addSource("end-pin-top", {
    type: "geojson",
    data: createGeoJSONCircle(trackGeojson.geometry.coordinates.slice(-1)[0], 0.25)
  });

  map.addLayer({
    id: "start-fill-pin-base",
    type: "fill-extrusion",
    source: "start-pin-base",
    paint: {
      'fill-extrusion-color': '#0bfc03',
      'fill-extrusion-height': 1000
    }
  });
  map.addLayer({
    id: "start-fill-pin-top",
    type: "fill-extrusion",
    source: "start-pin-top",
    paint: {
      'fill-extrusion-color': '#0bfc03',
      'fill-extrusion-base': 1000,
      'fill-extrusion-height': 1200
    }
  });

  map.addLayer({
    id: "end-fill-pin-base",
    type: "fill-extrusion",
    source: "end-pin-base",
    paint: {
      'fill-extrusion-color': '#eb1c1c',
      'fill-extrusion-height': 1000
    }
  });
  map.addLayer({
    id: "end-fill-pin-top",
    type: "fill-extrusion",
    source: "end-pin-top",
    paint: {
      'fill-extrusion-color': '#eb1c1c',
      'fill-extrusion-base': 1000,
      'fill-extrusion-height': 1200
    }
  });


};


// given a bearing, pitch, altitude, and a targetPosition on the ground to look at,
// calculate the camera's targetPosition as lngLat
let previousCameraPosition

// amazingly simple, via https://codepen.io/ma77os/pen/OJPVrP
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end
}

const computeCameraPosition = (
  pitch,
  bearing,
  targetPosition,
  altitude,
  smooth = false
) => {
  var bearingInRadian = bearing / 57.29;
  var pitchInRadian = (90 - pitch) / 57.29;

  var lngDiff =
    ((altitude / Math.tan(pitchInRadian)) *
      Math.sin(-bearingInRadian)) /
    70000; // ~70km/degree longitude
  var latDiff =
    ((altitude / Math.tan(pitchInRadian)) *
      Math.cos(-bearingInRadian)) /
    110000 // 110km/degree latitude

  var correctedLng = targetPosition.lng + lngDiff;
  var correctedLat = targetPosition.lat - latDiff;

  const newCameraPosition = {
    lng: correctedLng,
    lat: correctedLat
  };

  if (smooth) {
    if (previousCameraPosition) {
      const SMOOTH_FACTOR = 0.95
      newCameraPosition.lng = lerp(newCameraPosition.lng, previousCameraPosition.lng, SMOOTH_FACTOR);
      newCameraPosition.lat = lerp(newCameraPosition.lat, previousCameraPosition.lat, SMOOTH_FACTOR);
    }
  }

  previousCameraPosition = newCameraPosition

  return newCameraPosition
};

const createGeoJSONCircle = (center, radiusInKm, points = 64) => {
  const coords = {
    latitude: center[1],
    longitude: center[0],
  };
  const km = radiusInKm;
  const ret = [];
  const distanceX = km / (111.320 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;
  let theta;
  let x;
  let y;
  for (let i = 0; i < points; i += 1) {
    theta = (i / points) * (2 * Math.PI);
    x = distanceX * Math.cos(theta);
    y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ret],
    }
  };
}





const flyInAndRotate = async ({
    map,
    targetLngLat,
    duration,
    startAltitude,
    endAltitude,
    startBearing,
    endBearing,
    startPitch,
    endPitch,

  }) => {
    return new Promise(async (resolve) => {
      let start;
  
      var currentAltitude;
      var currentBearing;
      var currentPitch;
  
      // the animation frame will run as many times as necessary until the duration has been reached
      const frame = async (time) => {
        if (!start) {
          start = time;
        }
  
        // otherwise, use the current time to determine how far along in the duration we are
        let animationPhase = (time - start) / duration;
  
        // because the phase calculation is imprecise, the final zoom can vary
        // if it ended up greater than 1, set it to 1 so that we get the exact endAltitude that was requested
        if (animationPhase > 1) {
          animationPhase = 1;
        }
  
        currentAltitude = startAltitude + (endAltitude - startAltitude) * d3.easeCubicOut(animationPhase)
        // rotate the camera between startBearing and endBearing
        currentBearing = startBearing + (endBearing - startBearing) * d3.easeCubicOut(animationPhase)
  
        currentPitch = startPitch + (endPitch - startPitch) * d3.easeCubicOut(animationPhase)
  
        // compute corrected camera ground position, so the start of the path is always in view
        var correctedPosition = computeCameraPosition(
          currentPitch,
          currentBearing,
          targetLngLat,
          currentAltitude
        );
  
        // set the pitch and bearing of the camera
        const camera = map.getFreeCameraOptions();
        camera.setPitchBearing(currentPitch, currentBearing);
  
        // set the position and altitude of the camera
        camera.position = mapboxgl.MercatorCoordinate.fromLngLat(
          correctedPosition,
          currentAltitude
        );
  
        // apply the new camera options
        map.setFreeCameraOptions(camera);
  
        // when the animationPhase is done, resolve the promise so the parent function can move on to the next step in the sequence
        if (animationPhase === 1) {
          resolve({
            bearing: currentBearing,
            altitude: currentAltitude,
          });
  
          // return so there are no further iterations of this frame
          return;
        }
  
        await window.requestAnimationFrame(frame);
      };
  
      await window.requestAnimationFrame(frame);
    });
  };
  

  

// https://d3js.org/d3-ease/ v3.0.1 Copyright 2010-2021 Mike Bostock, 2001 Robert Penner
!function(n,e){"object"==typeof exports&&"undefined"!=typeof module?e(exports):"function"==typeof define&&define.amd?define(["exports"],e):e((n="undefined"!=typeof globalThis?globalThis:n||self).d3=n.d3||{})}(this,(function(n){"use strict";function e(n){return((n*=2)<=1?n*n:--n*(2-n)+1)/2}function t(n){return((n*=2)<=1?n*n*n:(n-=2)*n*n+2)/2}var u=function n(e){function t(n){return Math.pow(n,e)}return e=+e,t.exponent=n,t}(3),r=function n(e){function t(n){return 1-Math.pow(1-n,e)}return e=+e,t.exponent=n,t}(3),a=function n(e){function t(n){return((n*=2)<=1?Math.pow(n,e):2-Math.pow(2-n,e))/2}return e=+e,t.exponent=n,t}(3),o=Math.PI,i=o/2;function c(n){return(1-Math.cos(o*n))/2}function s(n){return 1.0009775171065494*(Math.pow(2,-10*n)-.0009765625)}function f(n){return((n*=2)<=1?s(1-n):2-s(n-1))/2}function h(n){return((n*=2)<=1?1-Math.sqrt(1-n*n):Math.sqrt(1-(n-=2)*n)+1)/2}var p=4/11,M=7.5625;function d(n){return(n=+n)<p?M*n*n:n<.7272727272727273?M*(n-=.5454545454545454)*n+.75:n<.9090909090909091?M*(n-=.8181818181818182)*n+.9375:M*(n-=.9545454545454546)*n+.984375}var l=1.70158,I=function n(e){function t(n){return(n=+n)*n*(e*(n-1)+n)}return e=+e,t.overshoot=n,t}(l),O=function n(e){function t(n){return--n*n*((n+1)*e+n)+1}return e=+e,t.overshoot=n,t}(l),x=function n(e){function t(n){return((n*=2)<1?n*n*((e+1)*n-e):(n-=2)*n*((e+1)*n+e)+2)/2}return e=+e,t.overshoot=n,t}(l),v=2*Math.PI,y=function n(e,t){var u=Math.asin(1/(e=Math.max(1,e)))*(t/=v);function r(n){return e*s(- --n)*Math.sin((u-n)/t)}return r.amplitude=function(e){return n(e,t*v)},r.period=function(t){return n(e,t)},r}(1,.3),b=function n(e,t){var u=Math.asin(1/(e=Math.max(1,e)))*(t/=v);function r(n){return 1-e*s(n=+n)*Math.sin((n+u)/t)}return r.amplitude=function(e){return n(e,t*v)},r.period=function(t){return n(e,t)},r}(1,.3),m=function n(e,t){var u=Math.asin(1/(e=Math.max(1,e)))*(t/=v);function r(n){return((n=2*n-1)<0?e*s(-n)*Math.sin((u-n)/t):2-e*s(n)*Math.sin((u+n)/t))/2}return r.amplitude=function(e){return n(e,t*v)},r.period=function(t){return n(e,t)},r}(1,.3);n.easeBack=x,n.easeBackIn=I,n.easeBackInOut=x,n.easeBackOut=O,n.easeBounce=d,n.easeBounceIn=function(n){return 1-d(1-n)},n.easeBounceInOut=function(n){return((n*=2)<=1?1-d(1-n):d(n-1)+1)/2},n.easeBounceOut=d,n.easeCircle=h,n.easeCircleIn=function(n){return 1-Math.sqrt(1-n*n)},n.easeCircleInOut=h,n.easeCircleOut=function(n){return Math.sqrt(1- --n*n)},n.easeCubic=t,n.easeCubicIn=function(n){return n*n*n},n.easeCubicInOut=t,n.easeCubicOut=function(n){return--n*n*n+1},n.easeElastic=b,n.easeElasticIn=y,n.easeElasticInOut=m,n.easeElasticOut=b,n.easeExp=f,n.easeExpIn=function(n){return s(1-+n)},n.easeExpInOut=f,n.easeExpOut=function(n){return 1-s(n)},n.easeLinear=n=>+n,n.easePoly=a,n.easePolyIn=u,n.easePolyInOut=a,n.easePolyOut=r,n.easeQuad=e,n.easeQuadIn=function(n){return n*n},n.easeQuadInOut=e,n.easeQuadOut=function(n){return n*(2-n)},n.easeSin=c,n.easeSinIn=function(n){return 1==+n?1:1-Math.cos(n*i)},n.easeSinInOut=c,n.easeSinOut=function(n){return Math.sin(n*i)},Object.defineProperty(n,"__esModule",{value:!0})}));



const animatePath = async ({
    map,
    duration,
    path,
    startBearing,
    startAltitude,
    pitch,
    prod,
  
  }) => {
    return new Promise(async (resolve) => {
      const pathDistance = turf.lineDistance(path);
      let startTime;
  
      const frame = async (currentTime) => {
        if (!startTime) startTime = currentTime;
        const animationPhase = (currentTime - startTime) / duration;
  
        // when the duration is complete, resolve the promise and stop iterating
        if (animationPhase > 1) {
  
          resolve();
          return;
        }
  
        // calculate the distance along the path based on the animationPhase
        const alongPath = turf.along(path, pathDistance * animationPhase).geometry
          .coordinates;
  
        const lngLat = {
          lng: alongPath[0],
          lat: alongPath[1],
        };
  
        // Reduce the visible length of the line by using a line-gradient to cutoff the line
        // animationPhase is a value between 0 and 1 that reprents the progress of the animation
        map.setPaintProperty(
          "line-layer",
          "line-gradient",
          [
            "step",
            ["line-progress"],
            "yellow",
            animationPhase,
            "rgba(0, 0, 0, 0)",
         ]
        );
  
        // slowly rotate the map at a constant rate
        const bearing = startBearing - animationPhase * 200.0;
  
        // compute corrected camera ground position, so that he leading edge of the path is in view
        var correctedPosition = computeCameraPosition(
          pitch,
          bearing,
          lngLat,
          startAltitude,
          true // smooth
        );
  
        // set the pitch and bearing of the camera
        const camera = map.getFreeCameraOptions();
        camera.setPitchBearing(pitch, bearing);
  
        // set the position and altitude of the camera
        camera.position = mapboxgl.MercatorCoordinate.fromLngLat(
          correctedPosition,
          startAltitude
        );
  
        // apply the new camera options
        map.setFreeCameraOptions(camera);
  
        // repeat!
        await window.requestAnimationFrame(frame);
      };
  
      await window.requestAnimationFrame(frame);
    });
  };
  
  
  