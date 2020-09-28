// Timeout parameters for how long to go between extensions of the auth by redeeming new ticket
// Check for Timeout Cookie
var pingMinutes = 10;
var pingMilliseconds = 1000 * 60 * pingMinutes;
var timeoutCookieName = 'ttime';

// Strings to display when events happen. You can obfuscate as necessary
var reauthNecessaryMsg = "Auth session cookie within range to expire, re-establishing auth";
var authTimeoutCookieExtendedMsg = 'Auth succeeded, extending the timeout cookie';
var redemptionSuccessMsg = "Image redemption succeeded!";
var redemptionFailureMsg = "Image redemption failed";
var tktReceivedMsg = 'Tkt received successfully';

/*
* Promises Methods necessary for Auth Flow
*/

// Promise version of a get() from https://developers.google.com/web/fundamentals/primers/promises
function get(url) {
  // Return a new promise.
  return new Promise(function(resolve, reject) {
    // Do the usual XHR stuff
    var req = new XMLHttpRequest();
    req.open('GET', url);

    req.onload = function() {
      // This is called even on 404 etc
      // so check the status
      if (req.status == 200) {
        // Resolve the promise with the response text
        resolve(req.response);
      }
      else {
        // Otherwise reject with the status text
        // which will hopefully be a meaningful error
        reject(Error(req.statusText));
      }
    };

    // Handle network errors
    req.onerror = function() {
      reject(Error("Network Error"));
    };

    // Make the request
    req.send();
  });
}

// Load an image but then throw Promises if it does or doesn't work to keep the chain going
function imgLoadPromise(url) {
    'use strict';
    // Create new promise with the Promise() constructor;
    // This has as its argument a function with two parameters, resolve and reject
    return new Promise(function (resolve, reject) {
        var redemptionImg = new Image();
        // Event handlers attach the handlers of the Promise that is passed in
        redemptionImg.onload =  function () {
            resolve(redemptionSuccessMsg);
        }
        redemptionImg.onerror = function () {
            reject(new Error(redemptionFailureMsg));
        }
       // Actually load the image here
        redemptionImg.src = redemptionUrl;
    });
}
/*
* Cookie functions from w3schools.org
*/
function setCookie(cname, cvalue, exdays) {
  var d = new Date();
  d.setTime(d.getTime() + (exdays*24*60*60*1000));
  if (exdays == 0){
    var expires = 0;
  }
  else{
    var expires = "expires="+ d.toUTCString();
  }

  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}


/*
* Auth Functions
*/

// One way to redeem would be a .png request
function buildAuthUrlPng(serverBaseUrl, site, wb, view, tkt){
    if(siteContentUrl === null){
        redemptionUrl = serverBaseUrl + "/trusted/" + tkt + "/views/" + wb + "/" + view + ".png";
    }
    else{
        redemptionUrl = serverBaseUrl + "/trusted/" + tkt + "/t/" + site + "/views/" + wb + "/" + view + ".png";
    }
    return redemptionUrl;
}

function extendTimeoutCookie(){
    var d = new Date();
    d.setTime(d.getTime() + (pingMinutes*60*1000));
    // Store the current time plus the pingMinutes in the cookie as a string
    setCookie(timeoutCookieName, d.valueOf(), 0);
}

function invalidateTimeoutCookie(){
    //console.log("Killing the current tableau cookie");
    // Store the current time plus the pingMinutes in the cookie as a string
    setCookie(timeoutCookieName, "", 0);
}

// Evaluates the cookie that records the last time any Trusted Auth process was completed successfully
function isAuthExpired(){
    var ttime_value = getCookie(timeoutCookieName);

    // Determine if you need to run the authPing process
    var doAuth = false;
    // If cookie is set
    if (ttime_value != ""){
        var currentTime = Date.now();
        var millisecondsSinceLastCookieSet = currentTime - parseInt(ttime_value, 10);
        // Check if the timeout has been passed, if so then act
        if (millisecondsSinceLastCookieSet >= pingMilliseconds) {
            doAuth = true;
        }
        // Do nothing if the timeout threshold hasn't passed
        else{
            doAuth = false;
        }
    }
    // If cookie does not exist, run process
    else{
        doAuth = true;
    }

    return doAuth;
}

// This is generic promises implementation of a trusted auth flow. Requests ticket -> Reedems via image -> calls callback
// Put whatever you want to happen after auth has been verified as a callback function using 'afterAuthCallback'
function authThenLoad(serverBaseUrl, site, wb, view, afterAuthCallback){
    // Check if the cookie saying the last auth ping is passed its timeout
    if (isAuthExpired()){
        console.log(reauthNecessaryMsg);
        // Request a tkt via AJAX, return is plaintext
        // Must set tktEndpoint value somewhere
        get(tktEndpoint).then(
            // Redeem
            function (tkt) {
                console.log(tktReceivedMsg);
                var fullAuthUrl = buildAuthUrlPng(serverBaseUrl, site, wb, view, tkt);
                // This returns a Promise, so we return it out of the function to keep the chain of Promises going
                return imgLoadPromise(fullAuthUrl);
            }
        ).then(
            // Do whatever you need after the image has been redeemed and cookie set
            function() {
                // If the image request completes correctly, you should have a session. Update the timeout cookie
                extendTimeoutCookie();
                console.log(authTimeoutCookieExtendedMsg);
                // Generic callback to allow you do to anything after auth is established
                // For example, on initial load, you might then load actual content
                // Later, an empty function just to extend the session timeout
                afterAuthCallback();
            }
        ).catch(
            function(error){
                console.log(error);
            }
        );
    }
    // If you determine that the auth is already good, just go and do whatever thing you do
    else{
        afterAuthCallback();
    }
}
