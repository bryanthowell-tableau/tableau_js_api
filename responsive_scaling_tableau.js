/*
* This library contains functions for handling the many quirks of how Tableau vizes come through when loaded
* into another page via the Tableau JS API.
* It is much indebted to John Hegele
*/

/*
* Looks at the debugFlag variable in your main code and only logs to console if that is set to true
*/
function debugLog(o){
    if (debugFlag){
        console.log(o);
    }
}

/* Actual phone ratio is 0.5635. Actual tablet ratio is .75. Actual min ratio for desktop is 1.33.
 * Since tablet is so much narrower than desktop, it looks better to scale down even below that ratio before switching ot tablet
 * Tablet sizes are cut in half from 1536:2048 to 768:1024
 */
var ratioBreakpoints = [ { 'tableauDeviceName' : 'desktop', 'minRatio' : 1.1, 'vizSizeDefaults': {'width': 1366, 'height': 768} },
                         { 'tableauDeviceName' : 'tablet',  'minRatio' :  0.66, 'vizSizeDefaults': {'width': 768, 'height': 1024} },
                         { 'tableauDeviceName' : 'phone', 'minRatio' :  0.0, 'vizSizeDefaults': {'width': 1080, 'height': 1920} },
                         { 'tableauDeviceName': 'web-edit', 'minRatio': 1.33, 'vizSizeDefaults': {'width': 1366, 'height': 768} },
                         { 'tableauDeviceName': 'ask-data', 'minRatio': 1.33, 'vizSizeDefaults': {'width': 1366, 'height': 768}}
                         ];

// Both of these get called in the scaleDiv() function when the ratio changes and the viz
// needs to reload with a different display option
// In your page where you are loading the content, you need to assign the actual function
// and options objects to these variables as well (both variable names will point to the same object in
// memory
var postResizeVizInitializationFunction;
var postResizeVizOptionsObject;

// The iframe adjustment function adds or removes a class to the iframe. This specifics the name of that class
var iframeWorksheetAdjustmentClassName = 'iframe-with-worksheet';

// Example class being used by the above
/*
.iframe-with-worksheet {
    position: relative;
    top: -5px;
    left: -5px;
}
*/

// Specifies the DIV to use to determine the space available to show the Tableau viz
// Not the vizDiv itself, but the DIV that it belong to
var nameOfOuterDivContainingTableauViz = 'outer-main-div';

// Pixel amounts to subtract from the calculated size of the OuterDivContainingTableauViz
// Without these offsets, the Viz will size to fill the full space, but typically you want slight margins
// Used within the scaleDiv() function below
var additionalWidthMargin = 30;
var additionalHeightMargin = 60;

// Global variable to delay the firing of resize event until browser really is done resizing
var vizResizeTimeoutFunctionId;

/*
* Helper Functions
*/

// helper to remove the 'px' value from returned CSS properties to do calculations
function removePx(cssValue){
    return cssValue.split('px')[0]
}

// helper to add the 'px' ending back for CSS properties that need it
function addPx(cssValue){
    // Remove any existing 'px' so that you can sanitize any value without worrying
    var strippedPx = cssValue.toString().split('px')[0];
    return strippedPx + "px";
}

/*
* End Helper Functions
*/

/*
* You can't know the type of a Sheet (worksheet or dashboard) until the onFirstInteractive event fires.
* This function is intended to work on the object returned by onFirstInteractive, which is generic "Tableau Event"
* So this function lives separately to adjust the sizes of the iframe and surrounding div to adjust for visual quirk
*
* NEED TO THINK THROUGH A TAB-SWITCH SITUATION, WHERE A VIZ OBJECT MAY LOAD AS DASHBOARD BUT
* SWITCH TO WORKSHEET OR VICE-VERSA
*/
function adjustForWorksheetOrDashboard(e){
    /*
    * Worksheets have a white 4px border, which looks bad when the Viz background color is not white
    * This outlines how to adjust to make it not an issue
    * The surrounding div needs to be set for "overflow: hidden;" and have 8px subtracted from height and width
    * While the iframe needs to be set to "position: relative; top: -4px; left: -4px;"
    * We have defined a CSS class:   iframe-with-worksheet {position: relative; top: -4px; left: -4px;}
    * But you could instead add and remove those properties separately
    */
    debugLog('Adjusting for worksheet or dashboard');
    var viz = e.getViz();
    var wb = viz.getWorkbook();
    var activeSheet = wb.getActiveSheet();
    var sheetType = activeSheet.getSheetType();
    // Because getParentElement() grabs the DOM node of the Div specified in the constructor
    var vizDiv = viz.getParentElement();
    // And then you get the iframe of the Viz, which will be inside that particular div
    var iframe = vizDiv.querySelectorAll('iframe')[0];

    if (sheetType == 'worksheet') {
        debugLog('Sheet is a Worksheet');
        // Fix up the Div
        vizDiv.style.overflow = 'hidden';
        var oHeight = vizDiv.style.height;
        var oWidth = vizDiv.style.width;
        if (oHeight == ""){
            oHeight = addPx(vizDiv.offsetHeight);
        }
        if (oWidth == ""){
            oWidth = addPx(vizDiv.offsetWidth);
        }

        // Remove PX from ending to do some math
        var oHeightInt = removePx(oHeight);
        var oWidthInt = removePx(oWidth);

        var nHeight = (oHeightInt - 10);
        var nWidth = (oWidthInt - 10);

        // Styles need 'px' at the end
        vizDiv.style.height = addPx(nHeight);
        vizDiv.style.width = addPx(nWidth);

        // Now apply the adjustment style the iframe
        iframe.classList.add(iframeWorksheetAdjustmentClassName);
    }
    else {
        debugLog('Sheet is a Dashboard');
        if (iframe.classList.contains(iframeWorksheetAdjustmentClassName)){
            iframe.classList.remove(iframeWorksheetAdjustmentClassName);
        }
    }
}


function whichDevice(availableSpaceRatio) {
    for (var i = 0, len = ratioBreakpoints.length; i < len; i++){
        if ( availableSpaceRatio >= ratioBreakpoints[i].minRatio) {
            return ratioBreakpoints[i].tableauDeviceName;
        }
    }
}

/*
* The visible space available for the Tableau viz will depend on other elements of the page.
* This function is where you define your own algorithm for determining the space available for Tableau content
*/
function getPageSpaceWidthHeight(){
    /*
    * You may need to modify your exact algorithm depending on how your page is defined
    * This example is configured for a page with a top titlebar, and a side-bar
    */

    // Notes on all of these functions and the differences between them
    // https://developer.mozilla.org/en-US/docs/Web/API/CSS_Object_Model/Determining_the_dimensions_of_elements

    // Visible Browser Width and Height (not calculated from the page elements, but the physical browser space)
    var browserWidth = document.documentElement.clientWidth;
    var browserHeight = document.documentElement.clientHeight;

    // One strategy is looking at the space allotted to the DIV that the Tableau vizDiv will go into
    var outerContainerDiv = document.getElementById(nameOfOuterDivContainingTableauViz);

    /*
    * Adjustments for other elements on the page:
    * Most web pages have structural elements like top bars and toolbars that actual restrict the space available for your viz div.
    * When you are calculating width and height, you need to look for the properties that result in the actual
    * visible space. For example, both top margin and padding might be subtracted out of your scaling for height
    * or left margin and padding for the width. Or you might look at the size of the other elements themselves.
    * This section will be the most customized to your own situation.
    * In our situation, we look at the paddings and margins because the overall height and width may flex and actually
    * not be fully determined until
    */

    var oStyles = window.getComputedStyle(outerContainerDiv);
    var computedPaddingTop = removePx(oStyles.getPropertyValue('padding-top'));
    var computedMarginTop = removePx(oStyles.getPropertyValue('margin-top'));
    var computedPaddingLeft = removePx(oStyles.getPropertyValue('padding-left'));
    var computedMarginLeft = removePx(oStyles.getPropertyValue('margin-left'));

    var totalVisibleWidth = outerContainerDiv.clientWidth - computedPaddingLeft - computedMarginLeft ;

    /*
     * Height of the element you put Tableau in may actually change based on the viz content that is loaded
     * so you may want to use the total browser height rather than whatever comes about the element you are sizing against.
     *
     */
    var totalVisibleHeight = browserHeight - computedPaddingTop - computedMarginTop;

    var finalWidth = totalVisibleWidth;
    var finalHeight = totalVisibleHeight;
    var ratio = finalWidth / finalHeight;
    return { 'width' : finalWidth, 'height' : finalHeight, 'ratio' : ratio };
}


/*
* The first principle for the scaling algorithm is that the iframe and containing div should have the same proportions
*
*/

// This is the callback function to use for onFirstVizSizeKnown
// in the Viz object constructor options object
function resizeVizContainerDivBase(VizResizeEvent){
    debugLog('Resizing based on actual size of viz');
    debugLog(VizResizeEvent);
    // By accessing the Viz object, this function becomes generic
    var thisViz = VizResizeEvent.getViz();
    // Because getParentElement() grabs the DOM node of the Div specified in the constructor
    var vizDiv = thisViz.getParentElement();
    // And then you get the iframe of the Viz, which will be inside that particular div
    var iframe = vizDiv.querySelectorAll('iframe')[0];
    // Get the state of the toolbar and tabbar, for correct adjustment of the iframe size
    var isToolbarHidden = thisViz.getIsToolbarHidden();
    var areTabsHidden = thisViz.getAreTabsHidden();
    debugLog("Hidden Toolbar " + isToolbarHidden);
    debugLog("Hidden Tabs " + areTabsHidden);
    /* You cannot get the Workbook object when this event fires from onFirstVizSizeKnown */
    /* Get the Sheet to see what sheetType it is. Worksheets by themselves (not in a dashboard) render with extra borders
        var wb = thisViz.getWorkbook();
        debugLog(wb);
        var activeSheet = wb.getActiveSheet();
        debugLog(activeSheet);
        var sheetType = activeSheet.getSheetType(); // will be 'worksheet', 'dashboard', or 'story'
        debugLog('Current Sheet is a : ' + sheetType);
    */

    // Finally we get the sheetSize object https://help.tableau.com/current/api/js_api/en-us/JavaScriptAPI/js_api_ref.htm#SheetSiz
    if (VizResizeEvent.getVizSize){
        var sheetSize = VizResizeEvent.getVizSize().sheetSize;
    }
    // If it is a tab-switch event, you have to get the viz object itself
    else{
        var sheetSize = VizResizeEvent.getViz().getVizSize().sheetSize;
    }
    debugLog(sheetSize);
    debugLog(iframe);

    // There are three possible states: 'automatic', 'range', and 'fixed'
    // But the JS API reports these as: AUTOMATIC, EXACTLY, RANGE, ATLEAST, and ATMOST.

    /*
     * The iframe generated by the new Viz constructor will always be the height and width passed in the options object
     * The challenge is making sure that the iframe is the actual size of the rendered content within,
     * so that you don't end up with scrollbars in the iframe.
     */

    /*
     *  If sheet is set to automatic, it should have the same size as the iframe.
     *  This actually happens because a width and height are passed to the constructor in the options object
     *  If they aren't, you'll probably just get loading errors.
     *  After this, we'll set the DIV to have the same width and height as the iframe
     */
    if (sheetSize.behavior == 'automatic'){
        debugLog('Automatically sized viz');
        var widthPx = addPx(iframe.clientWidth);
        var heightPx = addPx(iframe.clientHeight);
        debugLog("Current iframe width: " +  widthPx);
        debugLog("Current iframe height: " +  heightPx);
    }
    /*
     * 'exactly' vizes should have a maxSize and minSize that match
     */
    else if (sheetSize.behavior == 'exactly'){
        debugLog('Exactly sized viz');
        var widthPx = addPx(iframe.clientWidth);
        var heightPx = addPx(iframe.clientHeight);
        widthPx = addPx(sheetSize.maxSize.width);
        heightPx = addPx(sheetSize.maxSize.height);
        debugLog("Current iframe width: " +  widthPx);
        debugLog("Current iframe height: " +  heightPx);
        // Now set iframe to the maxWidth size if it exists, but whether this is the best case scenario I'm not sure,
        // because you really want the iframe to be the exact RENDERED height, and it's unclear if that's the case
        iframe.style.width = widthPx;
        iframe.style.height = heightPx;
    }
    /*
    * Logic for other Range Sized vizes is more complex
    * Given that a width and height were passed in as part of the options object
    * The actual rendered iframe should be
    */
    else {
        if (sheetSize.maxSize){
            var maxSize = sheetSize.maxSize;
            debugLog('Used the maxSize');
            // Weird edge case for the tablet and phone layouts when set to "fit width"
            if (maxSize.width == 2147483647){
                maxSize.width = iframe.clientWidth;
            }
        }
        else if (sheetSize.minSize){
            debugLog('No maxSize, looking at minSize');
            var maxSize = { 'width' : null, 'height' : null };
            if ( sheetSize.minSize.height >= iframe.clientHeight ){
                maxSize.height = sheetSize.minSize.height;
            }
            else {
                maxSize.height = iframe.clientHeight;
            }
            // var maxSize = size.minSize;
            if ( sheetSize.minSize.width >= iframe.clientWidth ){
                maxSize.width = sheetSize.minSize.width;
            }
            else {
                maxSize.width = iframe.clientWidth;
            }
        }

        // Adjust for the toolbar height
        // if (isToolbarHidden == false){ iframeHeight += 27   };
        // if (areTabsHidden == false) { iframeHeight += 23  }
        //
        debugLog("Reported viz width: " +  maxSize.width);
        debugLog("Reported viz height: " +  maxSize.height);
        var widthPx = addPx(maxSize.width);
        var heightPx = addPx(maxSize.height);
        debugLog("New iframe width: " +  widthPx);
        debugLog("New iframe height: " +  heightPx);
        // The iframe is set to the maxWidth size if it exists, but whether this is the best case scenario I'm not sure,
        // because you really want the iframe to be the exact RENDERED height, and it's unclear if that's the case
        iframe.style.width = widthPx;
        iframe.style.height = heightPx;
    }

    vizDiv.style.width = widthPx;
    vizDiv.style.height = heightPx;
    debugLog(vizDiv);
    debugLog('Resizing finished');
}

function resizeVizContainerDiv(VizResizeEvent){
    var thisViz = VizResizeEvent.getViz();
    // Because getParentElement() grabs the DOM node of the Div specified in the constructor
    var vizDiv = thisViz.getParentElement();
    // Main function to do the logic
    resizeVizContainerDivBase(VizResizeEvent);
    // Scale it to match the viewport, with multipleLayouts set to true
    scaleDiv(vizDiv, true);

    // Set the resizing event after the first time it's been scaled, with multipleLayouts true
    window.addEventListener('resize', function() { scaleDiv(vizDiv, true); });
}

function resizeVizContainerDivWebEdit(VizResizeEvent){
    var thisViz = VizResizeEvent.getViz();
    // Because getParentElement() grabs the DOM node of the Div specified in the constructor
    var vizDiv = thisViz.getParentElement();
    // Main function to do the logic
    resizeVizContainerDivBase(VizResizeEvent);
    // Scale it to match the viewport, with multipleLayouts set to false
    scaleDiv(vizDiv, false);

    // Set the resizing event after the first time it's been scaled, with multipleLayouts false
    window.addEventListener('resize', function() { scaleDiv(vizDiv, false); });
}

 /*
* Function to be called on browser resize (or the initial load) to scale th content Div to fit the visible space
*/
function scaleDiv(divToScale, multipleLayouts){
    debugLog('Rescaling the div');
    var currentPageSpace = getPageSpaceWidthHeight();
    debugLog(currentPageSpace);
    // Logic for regular vizes with Device Designer or Automatic sizing.
    // Want to check to see if also need a viz reload based on a change of proportions
    if (multipleLayouts == true){
        // Put on slight delay so this only happens if the page is still for a bit
        window.addEventListener("resize", function(){
            // Clears any previous attempt to run this stuff
            clearTimeout(vizResizeTimeoutFunctionId);
            vizResizeTimeoutFunctionId = setTimeout( function () {
                var newDeviceLayoutToUse = whichDevice(currentPageSpace.ratio);
                debugLog("New Layout: " + newDeviceLayoutToUse + ", Original Layout : " + deviceLayoutToUse);
                if (newDeviceLayoutToUse != deviceLayoutToUse){
                    debugLog('Need to switch device layouts');
                    postResizeVizOptionsObject.device = newDeviceLayoutToUse;
                    // Set the global so the next check won't trigger a reload
                    deviceLayoutToUse = newDeviceLayoutToUse;
                    // Now get the defaults to use from the ratioBreakpoints object and set those values in the options object
                    var vizWidthHeight;
                    for(var i = 0, len = ratioBreakpoints.length; i < len; i++){
                        if ( ratioBreakpoints[i]['tableauDeviceName'] == deviceLayoutToUse ){
                            vizWidthHeight = ratioBreakpoints[i]['vizSizeDefaults'];
                        }
                    }
                    postResizeVizOptionsObject.width = vizWidthHeight.width;
                    postResizeVizOptionsObject.height = vizWidthHeight.height;

                    viz.dispose(); // Is this safe to do here?
                    // This needs to be modular, this function is specific to our code
                    postResizeVizInitializationFunction();
                }
            },
            300);
        });
    }

    var vizDiv = divToScale;
    var iframe = vizDiv.querySelectorAll('iframe')[0];

    // Returns simple object with width and height properties
    var pageSpace = getPageSpaceWidthHeight();
    debugLog(pageSpace);
    /*
    * The basics of the algorithm is figure out the ratio of the width and height of the div
    * compared to the width and height of the available visible space in the page
    * with the result being no part of the div pushing into the scrollable area.
    * One quirk is that the browser page layout engine still considers a scaled viz to take up its unscaled dimensions.
    */

    /*
    * A viz could come through with any particular proportions (even if you've set out guidelines, it will happen).
    * So we calculate the width and the height logic, and scale based on whichever one is larger difference
    */

    // Visible Browser Width and Height (not calculated from the page elements, but the physical browser space)
    var browserWidth = document.documentElement.clientWidth;
    var browserHeight = document.documentElement.clientHeight;

    /*
    * Adjustments for other elements on the page:
    * Most web pages have structural elements like top bars and toolbars that actual restrict the space available for your viz div.
    * When you are calculating width and height, you need to look for the properties that result in the actual
    * visible space. For example, both top margin and padding might be subtracted out of your scaling for height
    * or left margin and padding for the width. Or you might look at the size of the other elements themselves.
    * This section will be the most customized to your own situation.
    */

    // Width Logic
    // additionWidthMargin just assumes for some type of padding / margin on both side rather than exact fit
    //var additionalWidthMargin = 30;
    var effectiveWidth = pageSpace.width - additionalWidthMargin;
    debugLog("There's about this much width for a viz: " + effectiveWidth);

    // Height Logic
    // Additional margin accounts for lower boundary / padding/margin
    //var additionalHeightMargin = 60;
    var effectiveHeight = pageSpace.height - additionalHeightMargin;
    debugLog("There's about this much height for a viz: " + effectiveHeight);

    // Is the viz Width larger than the viewport?
    var vizScaleToWindowWidth = iframe.clientWidth / effectiveWidth;
    debugLog('Scale factor of the viz to the available space based on width ' + vizScaleToWindowWidth);

    // Is the viz Height larger than the viewport?
    var vizScaleToWindowHeight = iframe.clientHeight / effectiveHeight;
    debugLog('Scale factor of the viz to the available space based on height ' + vizScaleToWindowHeight);

    // Use the smaller scale factor
    var vizScaleToWindow = vizScaleToWindowHeight;
    if (vizScaleToWindowWidth > vizScaleToWindowHeight){
        vizScaleToWindow = vizScaleToWindowWidth;
    }

    var flipScale = 1 / vizScaleToWindow;
    debugLog("Now rescaling the whole thing");

    // When scaling down, the scaling should happen to the left because the margins run out (auto) and the right side is the boundary
    //if (flipScale < 0.95) {

        /*
        * We scale it first based on the available space, and the proportion it is in
        */
        divToScale.style.transform = "scale(" + flipScale + ")";
        divToScale.style.transformOrigin = 'left top';

        /*
        * Then find the actual rendered space, and determine how space that leaves to the overall
        * available page space. Divide the extra by two,
        * then add the translate directive to the scale, which moves it along the x-axis
        */
        var clientRect = divToScale.getBoundingClientRect();
        var finalVizWidth = clientRect.width;
        debugLog("Width of the transformed element : " + finalVizWidth);
        var leftAdjust = (effectiveWidth - finalVizWidth) / 2;
        debugLog("Push to left about this much: " + leftAdjust);
        var leftAdjustPx = addPx(Math.floor(leftAdjust));
        divToScale.style.transform = "scale(" + flipScale + ") translate(" + leftAdjustPx + ", 0px)";
        //divToScale.style.transformOrigin = 'center top';
    //}
    // When scaling up, it makes sense to scale from the middle, because the viz gets recentered by the auto margins
    //else{
    //    divToScale.style.transform = "scale(" + flipScale + ")";
    //    divToScale.style.transformOrigin = 'left top';
    //}
}