<?php
    // Includes get_trusted_ticket() function
    include("rest/rest_api.php");
    $domain_name = 'http://localhost';
    $host = '';
    $user = '';
    
    if ( key_exists('username', $_POST) ) {
        $user = $_POST['username'];
    }
    
    if ( key_exists('view_location', $_POST ) ){
        $view_location_post = $_POST['view_location'];
    }
    
    //$site = 'agency'; //Site is necessary to build the URLs
    $view_location = 'Regional/Obesity'; // Put any view you want to use here

    $view_url = 'views/' . $view_location;
    $edit_ending = 'authoring/' . $view_location;
    
    // $ticket = trim ( get_trusted_ticket($host,$user,$site) );
    
    $viz_url = "\"$domain_name/" . $view_url . "\""; 

?>

<!doctype html>
<html>
<head>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
	<script type="text/javascript" src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>
    
    <script type='text/javascript' src='http://localhost/javascripts/api/tableau-2.js'></script>
    
    <title>Full Tableau Embed in iframe Including Web Edit</title>
    
    <script>
        // This much match with the domain you declare in the embed_wrapper.html file
        var declared_domain = '{yourdomain.com}'; // Obviously change here
        document.domain = declared_domain;
       
       var vizUrl = <?php echo $viz_url ?>;
        
        var workbook_name;
        var view_name;
              
        var viz;
        var book;
        var edit_iframe;
        var options = {
				// This function runs after the viz is loaded, so all additional API calls should generate from there
				onFirstInteractive : completeLoad,
				toolbarPosition : tableau.ToolbarPosition.BOTTOM,
                height: '800px',
                width : '1200px'
        };
        // jQuery onload
		$( function() {
            //$("#tableauViz").hide();
            $("#editViz").hide();

			console.log('Going to make the viz');
			viz = new tableau.Viz( $("#tableauViz").get(0), vizUrl, options);
             
		});
		
		function completeLoad(e) {
			/*$("#progressbar").progressbar({
				value : 100
			
            });*/
            
            // Assign global book variable
            console.log('Viz should now be loaded and available');
            book = viz.getWorkbook();        
            
            $("#tableauViz").show();
            
        }
           
        function launch_edit(){
            $("#tableauViz").hide();
            var edit_location = 'http://{yourdomain.com}/en/embed_wrapper.html?src=' + vizUrl; // Change for yours
            edit_iframe = document.createElement('iframe');
            edit_iframe.src = edit_location;
            
            // This makes it not look like an iframe
            edit_iframe.style.padding = '0px';
            edit_iframe.style.border = 'none';
            edit_iframe.style.margin = '0px';
            
            // Also set these with the same values in the embed_wrapper.html page
            edit_iframe.style.height = '800px';
            edit_iframe.style.width = '1200px';
            
            document.body.appendChild(edit_iframe);
                       
        }
        
        function iframe_change(new_url){
            // Destroy the original edit_iframe so you can build another one later if necessary
            $(edit_iframe).remove();
            // Destroy the original Tableau Viz object so you can create new one with URL of the Save(d) As version
            viz.dispose();
            
            // Reset the global vizURL at this point so that it all works circularly
            vizUrl = new_url;
            
            // Create a new Viz object with the new URL
            $("#tableauViz").show();
            viz = new tableau.Viz( $("#tableauViz").get(0), vizUrl, options);
     
 function iframe_change(new_url){
            // Destroy the original edit_iframe so you can build another one later if necessary
            $(edit_iframe).remove();
            // Destroy the original Tableau Viz object so you can create new one with URL of the Save(d) As version
            viz.dispose();
            
            // Reset the global vizURL at this point so that it all works circularly
            //viz_url = new_url;
            console.log("New URL should be: " + new_url);
            
            var url_parts = new_url.split('?');
            viz_url = url_parts[0];
            if (viz_url.search('authoring') !== -1){
                console.log('Found an authoring url');
                vizUrlForWebEdit = viz_url; 
                launch_edit();
                return;
           }
            // Handle site
            if (viz_url.search('/site/') !== -1){
                var url_parts = viz_url.split('#/site/');
                viz_url = url_parts[0] + "t/" + url_parts[1];
                vizUrlForWebEdit = viz_url;
            }
            console.log("New URL should be: " + viz_url);
            
            // Create a new Viz object with the new URL
            $("#tableauViz").show();
            console.log("tableauViz div now is shown");
            viz = new tableau.Viz( document.getElementById("tableauViz"), viz_url, options);
            console.log("Viz should be created");
     
        }
         
    </script>
</head>

<body>
<p>
<p><button onclick='launch_edit();'>Edit the Viz</button>
<div id='tableauViz' style='visibility: visible;'></div>

<div id='edit_div' style='z-index: 5; position: absolute;'></div>

</body>

</html>