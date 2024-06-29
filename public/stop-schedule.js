var dataByRoute = {};
var routes = [];
var routeIdsInOrder = [];

/** Formats time to a short 5:34PM, 10:35AM.*/
function formatTime(time) {
  return dtFormat.format(time)
    //.replace("M", "")
    .replace(" ", "");
    //.toLowerCase();
}

/** Extract the hour, minute, am/pm parts of a time string. */
function extractParts(stopTime) {
  var time = (stopTime.serviceDay + stopTime.scheduledDeparture) * 1000;
  var [hour, rest] = formatTime(time).split(":");
  return [hour, rest.substring(0, 2), rest.substring(2, 4)];
}

function stopTimeComparator(st1, st2) {
  return st1.serviceDay + st1.scheduledDeparture - st2.serviceDay - st2.scheduledDeparture;
}

/** Remove everything that follows 'via'. */
function removeDetailedDestinations(destinations) {
  return [...new Set([...destinations].map(d => d.split("via")[0].trim()))];
}

var symbols = ["*", "◊", "†", "◆", "§"];

function patternGlyph(index) {
  return `<sup>${symbols[index]}</sup>`;
}

/**
 * Collect route ids and the patterns and stop times for each route
 * into a structure of the form:
 * Record<string [routeId], {
 *   stopTimes: StopTime[],
 *   headsigns: Set<String>
 * }
 */
function collectStopTimesByRoute(stimes) {
  var result = {};
  stimes.forEach(({ pattern, times }) => {
    var routeId = pattern.route.gtfsId;
    var dataForRoute = result[routeId];
    if (!dataForRoute) {
      dataForRoute = result[routeId] = {
        stopTimes: [],
        headsigns: new Set()
      };
    }
    // Exclude last stops in the pattern (assumes position is 1-based).
    // Exclude arriving-only patterns.
    times
      .filter(t => t.stopPosition !== pattern.stops.length)
      .forEach(t => {
        dataForRoute.stopTimes.push(t);
        dataForRoute.headsigns.add(pattern.headsign);
      });
  });
  return result;
}

function addServiceDay(dataByRoute, stop, serviceDay) {
  var serviceDayData = collectStopTimesByRoute(stop[serviceDay]);
  Object.keys(serviceDayData).forEach(routeId => {
    var dataForRoute = dataByRoute[routeId];
    if (!dataForRoute) {
      dataForRoute = dataByRoute[routeId] = {
        headsigns: new Set(),
      };
    }
    var routeServiceDayData = serviceDayData[routeId];
    dataForRoute[serviceDay] = [...routeServiceDayData.stopTimes].sort(stopTimeComparator);
    dataForRoute.headsigns = new Set([...dataForRoute.headsigns, ...routeServiceDayData.headsigns]);
  });
}

/** Helper to compare stop times on two service days */
function sameStopTimes(times1, times2) {
  if (times1.length !== times2.length) return false;
  if (times1.length === 0) return true;

  for (var i = 0; i < times1.length; i++) {
    if (times1[i].scheduledDeparture !== times2[i].scheduledDeparture) return false;
  }
  return true;
}

/** Combines service days if the stop times in there are the same. */
function combineServiceDays(dataByRoute) {
  // Go through each route
  Object.values(dataByRoute).forEach(dataForRoute => {
    var { weekdayStopTimes, saturdayStopTimes, sundayStopTimes } = dataForRoute;
    // Check saturday-sunday first.
    // Assume that Weekday is always present, and if sunday is same as weekday, then saturday is too.
    if (sameStopTimes(saturdayStopTimes, sundayStopTimes)) {
      if (
        sameStopTimes(weekdayStopTimes, saturdayStopTimes) &&
        sameStopTimes(weekdayStopTimes, sundayStopTimes)
      ) {
        dataForRoute.combine = "ALL";
      } else {
        dataForRoute.combine = "WEEKEND";
      }
    }
  });
}

/** Prints one stop time (includes footnote references) */
function printStopTime(tj, allDestinations, firstDestination) {
  var [hour, minutes] = extractParts(tj);
  var hasFootnote = tj.headsign !== firstDestination;
  var footnoteIndex = allDestinations.indexOf(tj.headsign);
  var footnoteKind = footnoteIndex % 2 === 1 ? "odd" : "";
  return `<span class="minutes ${hasFootnote ? "footnote " + footnoteKind : ""}">:${minutes}${
    (hasFootnote ? patternGlyph(footnoteIndex) : "")
  }</span>`;
}

/** Prints a service hour. */
function printTableServiceHour(hourStopTimes, allDestinations, firstDestination) {  
  return `<td><span class="hour-cell">${hourStopTimes
    ? hourStopTimes
      .map(tj => printStopTime(tj, allDestinations, firstDestination))
      .join("")
    : ""}</span></td>`;
}

/** Prints the schedule header for a route (assumes weekday is different from weekend). */
function printScheduleHeaders(printData) {
  var { combine } = printData;
  var headers;
  if (combine === "ALL") {
    headers = ["7 days"];
  } else if (combine === "WEEKEND") {
    headers = ["Weekdays", "Weekend"];
  } else {
    headers = ["Weekdays", "Saturday", "Sunday"];
  }
  return `<tr class="header"><th></th>${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
}

/** Print footnotes i.e. pattern-specific descriptions. */
function printFootnotes(printData) {
  var { allDestinations, mainDestinations } = printData;
  var dest1 = mainDestinations[0];
  var footnotes = allDestinations
    .filter(d => d !== dest1)
    .map((d, i) =>
      patternGlyph(i) + (d.startsWith(dest1) ? d.split(dest1)[1].trim() : d)
    );
  return footnotes.length
    ? `<div>${footnotes.join("<br/>")}</div>`
    : "";
}

function moveBefore(div) {
  if (div.previousSibling) {
    div.parentElement.insertBefore(div, div.previousSibling);
  }
}

function containingDiv(button) {
  // td < tr < thead < table < div.route-wrapper
  return button.parentElement.parentElement.parentElement.parentElement.parentElement;
}

function onMoveBefore(e) {
  moveBefore(containingDiv(e));
}

function onMoveAfter(e) {
  var nextDiv = containingDiv(e).nextSibling;
  if (nextDiv) {
    moveBefore(nextDiv);
  }
}

/** Prints the schedule table for a route. */
function printScheduleTable(printData, routeNumber) {
  var { allDestinations, combine, mainDestinations } = printData;
  var dest1 = mainDestinations[0];
  var content = "<table>";

  content += `<thead class="route">
  <tr class="buttons">
  <td colspan="3">
    <button onclick="onMoveBefore(this)" title="Move before">&lt;</button><button onclick="onMoveAfter(this)" title="Move after">&gt;</button>
  </td>
  </tr>
  <tr>
  <td class="number">${routeNumber}</td>
  <td class="dest" colspan="3"><span>${mainDestinations.join("<br/>")}<span></td>
  <tr>
  <tr><td class="sep"></td></tr>
  </thead>`;

  content += "<tbody>";
  content += printScheduleHeaders(printData);

  var prevAmPm = "";
  Object.keys(printData).filter(id => id.indexOf("_") > -1).forEach(hourId => {
    var [hour, amPm] = hourId.split("_");
    content += `<tr><th scope="row">${prevAmPm !== amPm ? 
      `<span class="ampm">${amPm}</span>${(0+hour) < 10 ? "&nbsp;" : ""}&nbsp;` : ""}${hour}</th>`;
    var hourData = printData[hourId];

    content += printTableServiceHour(hourData.weekdayStopTimes, allDestinations, dest1);
    if (combine !== "ALL") {
      content += printTableServiceHour(hourData.saturdayStopTimes, allDestinations, dest1);  
      if (!combine) {
        content += printTableServiceHour(hourData.sundayStopTimes, allDestinations, dest1);
      }
    }
    content += "</tr>";
    prevAmPm = amPm;
  });
  content += `</tbody></table>`;
  return content;
}

/** Returns a map of entries indexed by hour (assumes weekday service has the largest hour span). */
function putServiceDayPrintData(dataForRoute, serviceDay, result) {
  var stopTimes = dataForRoute[serviceDay];
  var prevHour = "";
  stopTimes.forEach(tj => {
    var [hour, minutes, amPm] = extractParts(tj);
    var hourId = `${hour}_${amPm}`;
    if (hour !== prevHour) {
      if (!result[hourId]) {
        result[hourId] = {};
      }
      if (!result[hourId][serviceDay]) {
        result[hourId][serviceDay] = [];       
      }
      prevHour = hour;
    }
    result[hourId][serviceDay].push(tj);
  });
}

/** Returns a map of entries indexed by hour (assumes weekday service has the largest hour span). */
function getPrintData(dataForRoute) {
  var result = {};
  putServiceDayPrintData(dataForRoute, "weekdayStopTimes", result);
  putServiceDayPrintData(dataForRoute, "saturdayStopTimes", result);
  putServiceDayPrintData(dataForRoute, "sundayStopTimes", result);
  result.combine = dataForRoute.combine;

  var allDestinations = [...dataForRoute.headsigns];
  var mainDestinations = removeDetailedDestinations(allDestinations);
  result.allDestinations = allDestinations;
  result.mainDestinations = mainDestinations;
  return result;
}

/** Prints the schedules for a route. */
function printRoute(route, routeId) {
  var printData = getPrintData(dataByRoute[routeId]);
  var content = "";
  content += printScheduleTable(printData, route.shortName);
  content += printFootnotes(printData);
  return content;
}

function initStopTimes(stop) {
  var stopTitle = document.getElementById("stop-title");
  stopTitle.innerHTML = `${stop.name} <span class="stopcode">${stop.code}</span>`;
  routes = stop.routes;

  addServiceDay(dataByRoute, stop, "weekdayStopTimes");
  addServiceDay(dataByRoute, stop, "saturdayStopTimes");
  addServiceDay(dataByRoute, stop, "sundayStopTimes");
  combineServiceDays(dataByRoute);

  // Sort route numbers, based on number only.
  routeIdsInOrder = Object
    .keys(dataByRoute)
    .map(k => ({
      id: k,
      shortNameInt: Number.parseInt((routes.find(r => r.id === k) || {}).shortName)
    }))
    .sort((r1, r2) => r1.shortNameInt - r2.shortNameInt)
    .map(r => r.id);
}

function printStopTimes() {
  var scheduleBody = document.getElementById("schedule-body");
  routeIdsInOrder.forEach((routeId, index) => {
    var route = routes.find(r => r.id === routeId) || {};
    var element = document.createElement("div");
    element.id = `route-${routeId}`;
    element.className = "route-wrapper";
    element.innerHTML = printRoute(route, routeId);
    scheduleBody.appendChild(element);
  });
}

function getStopTimesSubQuery(startTime) {
  return `stoptimesForPatterns(numberOfDepartures: 1000, startTime: ${startTime}, omitNonPickups: true, omitCanceled: false) {
    pattern {
      desc: name
      headsign
      id: code
      route {
        gtfsId
      }
      stops {
        id
      }
    }
    times: stoptimes {
      headsign
      scheduledDeparture
      serviceDay
      stopPosition
      trip {
        id
        pattern {
          id
        }
        route {
          gtfsId
        }
      }
    }
  }`  
}

var query =
`query StopTimes(
  $stopId: String!
  $weekdayStartTime: Long!
  $saturdayStartTime: Long!
  $sundayStartTime: Long!
) {
  stop(id: $stopId) {
    id: gtfsId
    code
    locationType
    name
    wheelchairBoarding
    routes {
      id: gtfsId
      agency {
        gtfsId
        name
      }
      longName
      mode
      color
      textColor
      shortName
      patterns {
        id
        headsign
      }
    }

    weekdayStopTimes: ${getStopTimesSubQuery('$weekdayStartTime')}
    saturdayStopTimes: ${getStopTimesSubQuery('$saturdayStartTime')}
    sundayStopTimes: ${getStopTimesSubQuery('$sundayStartTime')}
  }
}`;

function fetchByGtfsId(gtfsId) {
  if (gtfsId) {
    // TODO: compute a date for a weekday, a Saturday, and a Sunday.
    // The day starts/ends at 3am = 3*3600s = 10800s
    var body = {
      query,
      variables: {
        stopId: gtfsId, // "MARTA:81900", // "MARTA:53900"
        weekdayStartTime: 1713769200, // Mon 22 Apr 2024 03:00
        saturdayStartTime: 1713596400, // Sat 20 Apr 2024 03:00
        sundayStartTime: 1713682800 // Sun 21 Apr 2024 03:00
      }
    };
    fetch(getOtpGraphQLEndpoint(), {
      "body": JSON.stringify(body),
      "headers": {
        "content-type": "application/json"
      },
      "method": "POST",
      "mode": "cors"
    })
    .then(response => response.text())
    .then(text => {
        var loadedStop = JSON.parse(text).data.stop;
        initStopTimes(loadedStop);
        printStopTimes();
    });
  }
}

var sId = getGtfsId();
if (sId) fetchByGtfsId(sId);
else {
  var stopId = getStopId();
  if (stopId) {
    fetchStopId(stopId)
      .then(fetchByGtfsId)
      .then(() => updateLinks(stopId));
  }
}
