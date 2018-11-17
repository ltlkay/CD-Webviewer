/*******************************************************
 * Author: 	Omar Hesham, June 2015.
 * Advanced Real-Time Simulation Lab.
 * Carleton University, Ottawa, Canada.​​
 * License: [TODO] Something opensource
 *
 * Project: 	Online Cell-DEVS Visualizer
 * File: 		view.js
 * Description: The View component of the Grid object
 * 				handles the display of the Grid Model
 * 				(model.js) and the associated UI
 * 				commands
 */

// [TODO] Modulize the entire "grid" object for easy namespace and member privacy
// 
grid = {};
util = {};
stats = {};
charts = {};
charts.states = null;
charts.transitions = null;

/** Global grid object {model, view, data} \*/
grid.model = {};
grid.model.name = 'CellDevsModel';	// Model Name (ID)
grid.model.dimX = 1;	// Rows
grid.model.dimY = 1;	// Columns
grid.model.dimZ = 1; 	// Depth 
grid.model.frameCount = 0; // start with frame 0
grid.model.updatePacketsPipe = [];
grid.view = {};
grid.view.viewBuffer = [];	// stores full frame copy of current view frame
grid.view.dataCache = []; // stores periodic snapshots of frames to allow random seeking
grid.view.CACHE_PERIOD = 10;	// Store a cache point once every 10 frames 
grid.view.CACHE_ENABLED = true;	
grid.view.SHOW_CACHE_ONLY = false;	
grid.view.cacheCount = 0;
//grid.view.cacheID = true;		// id of cache frames (e.g. 0:0, 10:1, 20:2, etc)	
grid.view.currentTimeFrame = 1;
grid.view.div = grab('grid');
grid.view.valueDisplay = grab('showValues').checked;
grid.view.zeroDisplay = grab('showZero').checked;
grid.view.showStats = grab('showStats').checked;
grid.view.showStateFreq = grab('showStateFreq').checked;
grid.view.showTransitions = grab('showTransitions').checked;
grid.view.timeline = grab('timeline');
grid.view.canvy = grab('canvy');
grid.view.canvyDiv = grab('canvyDiv');
grid.view.barHeight = 20; //pixels
grid.view.barWidth = 15;
grid.view.layoutColumns = 1; // columns of port layers 
grid.view.layersNeedUpdate = true;
grid.view.gridOverlayWidth = 1;
grid.view.playbackHandle = 0;
grid.view.playbackDirection = 0; // 0: paused, 1: forwards, 2: backwards
grid.view.FPS = 1000/ grab('framerate').value;
grid.view.frameTimer = 0;
grid.view.gfx;
grid.view.redrawRequested = true;
SCL = grab('cellScale').value;
grid.view.isRecording = false;
grid.view.video = {};
grid.view.videoOutput;


function previousCacheTime(t){	// find most previous cache point to time t
	var	isLastFrame = (t==(grid.model.frameCount-1));
	return isLastFrame ? t : Math.floor(t/grid.view.CACHE_PERIOD)*grid.view.CACHE_PERIOD;}
function nearestCacheTime(t){	// find nearest cache point to time t (upper bounded)
	var	isLastFrame = (t==(grid.model.frameCount-1));
	return Math.min(grid.model.frameCount-1,
		isLastFrame ? t : Math.round(t/grid.view.CACHE_PERIOD)*grid.view.CACHE_PERIOD);
}


grid.loadSimulation = function(){
	if(!inp.logLoaded){
		alert("Please select a simulation log.")
		return;
	}
	grid.pausePlayback();
	grab('BtnParseY').style.background = 'rgba(35,112,77, 0.5)';
	grab('BtnParseY').disabled = true;
	grid.model.data=[];
	inp.parseYChunks();
	// Guess a good zoom scale to start with (at least 1px wider than grid lines)
	SCL = Math.max(Math.round(750/(grid.model.dimX*grab('layoutColumns').value)), 1+grid.view.gridOverlayWidth);
	grab('cellScale').value = SCL;
	// Setup timeline ticks to match cached frames (purely aesthetic feedback)
	//  -- harder than I thought. too much hastle at this point
}

grid.setupGrid = function(){
	//Show canvas
	grid.view.canvy.style.display='';
	grid.view.canvyDiv.style.display='';
	// Clear everything to init values
	//grid.model.frameCount = 0; // start with frame 0
	grid.view.currentTimeFrame = 0;
	grid.pausePlayback() // stop any playing
	//grid.init() // reset grid data and reload input properties

	var gridDiv = grid.view.div;
	var gridData= grid.model; 

	// Set max columns
	var cols = grab('layoutColumns');
	cols.max = grid.model.ports.length * gridData.dimZ; 
	//cols.value = Math.min(cols.value, cols.max) // clip it if necessary

	// Disable extra 'out' port by default
	var skipOut = 0
	if(grid.model.ports.length>1&&grid.model.ports[grid.model.ports.length-1]=='out')
		skipOut = 1;	

	// If only single port in single layer, disable port title bar
	grid.view.barHeight= (grid.model.ports.length == 1 && gridData.dimZ == 1) ? 0 : 20;
	var canvy = grid.view.canvy;
	
	grid.view.gfx = canvy.getContext('2d');
	var nGrid = gridData.dimZ*(grid.model.ports.length-skipOut);
	
	canvy.width = (gridData.dimX*SCL+grid.view.barWidth) * grid.view.layoutColumns - grid.view.barWidth;
	canvy.height= (gridData.dimY*SCL+grid.view.barHeight)* Math.ceil(nGrid/grid.view.layoutColumns);
  
	// Signal that layers need to be redrawn
	grid.view.layersNeedUpdate = true;

	// Renable timeline controls
	grid.toggleUI(true, ['precision','BtnRecord','BtnPlay', 'timelineSeek',
						  'fixedPrecision', 'precision','loop', 'BtnRewind', 
						  'BtnPlayBw','BtnStepBw', 'BtnStepFw','BtnLastFrame',
						  'showValues', 'showGridOverlay', 'layoutColumns',
						  'showStats', 'showTransitions','showStateFreq']);
	if(grab('showValues').checked) 		grid.toggleUI(true, ['showZero']);
	if(grab('showGridOverlay').checked) grid.toggleUI(true, ['gridOverlayColor']);

	// Disable random access and backwards playback if cache is disabled
	if(!grid.view.CACHE_ENABLED)
		grid.toggleUI(false, ['timelineSeek','BtnPlayBw','BtnStepBw','BtnLastFrame']);

	// Populate "Detected Layers" list and clear it
	var layersList = grab('LayersList'); layersList.innerHTML='';
	
	for (var z=0; z<gridData.dimZ; z++){
		layersList.innerHTML += 
			"<label><input onclick='grid.toggleLayer(["+z+",-1])' type='checkbox' id='layer"+z+"' checked>Layer"+z+" (x,y,"+z+")</label><br>";
				
		for (var i=0; i<grid.model.ports.length;i++){
			layersList.innerHTML += "&emsp;&#10149;<label><input onclick='grid.toggleLayer(["+z+","+i+
					"])' type='checkbox' id='Layer"+z+"_Port"+grid.model.ports[i]+"' checked>Port:"+grid.model.ports[i]+"</label>" + 
					"&emsp;<label><input onclick='grid.toggleCharts("+z+","+i+")' name='chartRadio' type='radio' id='Layer_"+z+"_Port_"+i+"_Chart'>Charts</label><br>";
			
			if(i==grid.model.ports.length-1)
				LayersList.innerHTML += "<hr>";	// insert divider after last port in this layer
		}
		// Check weird 'out' port
		if(skipOut)
			grab('Layer'+z+'_Port'+'out').checked = false;
		
	}
	//******************
	// Finally, initialize the single view frame buffer, ready for rendering (updateGridView).
	// This buffer will eliminate the need to rewind playback every time we change a paramter,
	// while still maintaining the memory efficiency of incremental-only playback.
	var fb 	 = grid.view.viewBuffer;	  // shorthand
	var data = grid.model.data[0].cells;  // shorthand
	for (var z=gridData.dimZ; z-->0;){
		fb[z] = [];
		for (var y=gridData.dimY; y-->0;){
			fb[z][y] = [];
			for (var x=gridData.dimX; x-->0;){	
				fb[z][y][x] = [];
			}
		}
	}
}

grid.updateGridView = function(){
	var data 			= grid.model.data,		// shorthand
		ports 			= grid.model.ports,
		precision 		= grab('precision').value,
		fixedPrecision 	= grab('fixedPrecision').checked,
		canvy 			= grid.view.canvy,
		barH 			= grid.view.barHeight,
		barW 			= grid.view.barWidth,
		cols 			= grid.view.layoutColumns,
		gfx 			= grid.view.gfx,
		vDisplay		= grid.view.valueDisplay,
		zeroDisplay 	= grid.view.zeroDisplay,
		showStats       = grid.view.showStats,
		showTransitions = grid.view.showTransitions,
		showStateFreq   = grid.view.showStateFreq,
		fb 				= grid.view.viewBuffer,
		dc 				= grid.view.dataCache

	if (!data.length) return;		// if there's no data, return

	gfx.font = (0.7*SCL)+'px Arial';
	gfx.textAlign = 'center';
	// Loop over every layer to render it
	var t = grid.view.currentTimeFrame;
	var p = grid.palette; // shorthand: p[i]=[//pair [//range [start, end], // color [R,G,B]]]
	var v, cell;
	var gridOverlayColor = grab('gridOverlayColor').value || 'rgb(120,120,130)';

	var layerWidth  = SCL*grid.model.dimX,	// not including port layer padding (barW)
		layerHeight = SCL*grid.model.dimY;	// not including port title (barH)
		
	// Clear entire grid if layers need update
	if(grid.view.layersNeedUpdate){
		// Transparent pixels break Whammy encoder
		//gfx.clearRect(0, 0,canvy.width,canvy.height); 
		
		// Use canvas div bg color instead
		gfx.fillStyle = window.getComputedStyle(canvyDiv).getPropertyValue('background-color');
		gfx.fillRect(0, 0,canvy.width,canvy.height);
	}
	
	// Is this frame cached? (i.e. last or multiple of caching period)
	var	isLastFrame 	= (t==(grid.model.frameCount-1));
	var	frameIsCached 	= isLastFrame || !(t%grid.view.CACHE_PERIOD);
	grid.view.redrawRequested=grid.view.redrawRequested||frameIsCached; //request full frame render
	var cacheID 		= isLastFrame ? dc.length-1: Math.floor(t/grid.view.CACHE_PERIOD);	
	var cacheEnabled 	= grid.view.CACHE_ENABLED;
	var showCacheOnly 	= grid.view.SHOW_CACHE_ONLY;

	// Fill the single-frame view buffer (fb[z][y][x]=cell[x][y][z].value)
	if(frameIsCached) // grab directly from cache if available
		grid.view.viewBuffer = JSON.parse(JSON.stringify(dc[cacheID]))
	else{
		for (var i=0; i<data[t].cells.length; i++){
			var ps  = data[t].cells[i].position.slice();
			var val = data[t].cells[i].value.slice();
			// Only update ports that are defined (!null) in this time frame 
			// (otherwise keep previous frame values; exactly what we want)
			for(var portato=0; portato<ports.length;portato++)
				if( val[portato] != null)
					fb[ps[2]][ps[1]][ps[0]][portato]= val[portato];
		}
	}

	for (var layer=0, column=-1,row=-1; layer < grid.model.dimZ; layer++){	// for each layer (2D slice of a 3D grid)
		//row=-1; // start "newline" every layer? comment if not desirable
		for (var portID=0, port=-1 ; portID<ports.length; portID++){	// for each port
			var isShowPort = grab('Layer'+layer+'_Port'+ports[portID]);
			if(!isShowPort.checked || isShowPort.disabled) 
				continue;	// if port is unchecked or disabled, skip to next port
			
			// Increment displayed ports counter
			port++;
			// Increment column id (modulo user-specified layoutColumns)
			column++; column %= cols;
			// New row only if returned to column 0
			if(column==0) row++;
			
			// Anchor (top-left corner of current port layer)
			var layerPosX = column*(layerWidth+barW),
				layerPosY = barH+row*(layerHeight+barH);

			// Redraw layer title bars
			if(grid.view.layersNeedUpdate){
				// Clear entire port layer
				//gfx.clearRect(layerPosX, layerPosY-barH,layerPosX+layerWidth+barW,layerPosY+layerHeight);
				// Clear current bar
				gfx.shadowBlur=0;
				gfx.fillStyle = 'rgb(40,40,40)';
				gfx.fillRect(layerPosX, layerPosY-barH,layerPosX+layerWidth,layerPosY);
				// Render port title bar
				gfx.font = 'normal '+barH*0.6+'px monospace';
				gfx.textAlign = 'left';
				gfx.fillStyle = 'rgb(190,190,190)';
				gfx.fillText('\u25BC Layer:'+layer+' [Port:'+ports[portID]+']',layerPosX,layerPosY-barH*0.25);			
			}
			
			// **** If redraw requested, render entire buffer(not just incremental update in this frame)
			if(grid.view.redrawRequested){
				// remove the request, we're about to process the last port of its last layer 
				if(layer==grid.model.dimZ-1 && portID==ports.length-1)
					grid.view.redrawRequested = false;
				for (var y=grid.model.dimY; y-->0;){
					for (var x=grid.model.dimX; x-->0;){	
						if(cacheEnabled && (frameIsCached || showCacheOnly))
							v = dc[cacheID][layer][y][x][portID];	// use cache
						else
							v = fb[layer][y][x][portID];			// use framebuffer
						gfx.shadowColor = 'rgba(0,0,0,0)';
						gfx.shadowBlur = 0;
						
						// Find palette color p[i]=[[begin,end],[r,g,b]]
						gfx.fillStyle = '#9696A0'; // start with default
						for(var c=p.length;c-->0;){
							if(v>= p[c][0][0] && v<p[c][0][1]){
								gfx.fillStyle = 'rgb('+p[c][1][0]+','+p[c][1][1]+','+p[c][1][2]+')';
								break;
							}
						}

						// Draw the grid cell [TODO] Replace rect with image pixels
						var posX = layerPosX + SCL*x,
							posY = layerPosY + SCL*y;
						gfx.fillRect(posX,posY, SCL,SCL);

						// Render the values (text) 
						gfx.fillStyle = 'white';
						gfx.shadowColor = 'black';
						gfx.shadowOffsetX = 0;
						gfx.shadowOffsetY = 1;
						gfx.shadowBlur = 3.5;
						gfx.textAlign = 'center';
						// Get value to certain decimal places
						var vP = v.toFixed(precision);
						if(!fixedPrecision)	// truncate trailing 0s
							vP = parseFloat(vP).toString();
						// Adjust font size to fit value into cell
						gfx.font = (SCL*2/(vP.toString().length+2))+'px monospace';
						if(vDisplay){
							if(v==0)
								gfx.fillText((zeroDisplay ? vP:''),(SCL/2)+posX,(SCL/1.3)+posY, SCL) ;
							else 
								// because Math.trunc() not yet supported by chrome, we do this:
								//gfx.fillText((v<0 ? Math.ceil(v) : Math.floor(v)),(SCL/2)+posX,(SCL/1.3)+posY);
								gfx.fillText(vP,(SCL/2)+posX,(SCL/1.3)+posY, SCL);
						}
					}
				}	
			}
			else if(!showCacheOnly) {	// *** render incremental only (skip if only showing cache)
				for(var i=0; i < data[t].cells.length; i++){
					cell = data[t].cells[i];						// shorthand
					if(cell.position[2]!=layer) continue;			// wrong layer
					if(cell.value[portID]==null) continue;  		// wrong port
					var x = cell.position[0], y = cell.position[1];
					v = fb[layer][y][x][portID];					// use framebuffer
					gfx.shadowColor = 'rgba(0,0,0,0)';
					gfx.shadowBlur = 0;

					// Find palette color p[i]=[[begin,end],[r,g,b]]
					gfx.fillStyle = '#9696A0'; // start with default
					for(var c=p.length;c-->0;){
						if(v>= p[c][0][0] && v<=p[c][0][1]){
							gfx.fillStyle = 'rgb('+p[c][1][0]+','+p[c][1][1]+','+p[c][1][2]+')';
							break;
						}
					}

					// Draw the grid cell
					var posX = layerPosX + SCL*x,
						posY = layerPosY + SCL*y;
					gfx.fillRect(posX,posY, SCL,SCL);

					// Render the values (text) 
					gfx.fillStyle = 'white';
					gfx.shadowColor = 'black';
					gfx.shadowOffsetX = 0;
					gfx.shadowOffsetY = 1;
					gfx.shadowBlur = 3.5;
					gfx.textAlign = 'center';
					// Get value to certain decimal places
					var vP = v.toFixed(precision);
					if(!fixedPrecision)	// truncate trailing 0s
						vP = parseFloat(vP).toString();
					// Adjust font size to fit value into cell
					gfx.font = (SCL*2/(vP.toString().length+2))+'px monospace';
					if(vDisplay){
						if(v==0)
							gfx.fillText((zeroDisplay ? 0:''),(SCL/2)+posX,(SCL/1.3)+posY, SCL) ;
						else 
							// because Math.trunc() not yet supported by chrome, we do this:
							//gfx.fillText((v<0 ? Math.ceil(v) : Math.floor(v)),(SCL/2)+posX,(SCL/1.3)+posY);
							gfx.fillText(vP,(SCL/2)+posX,(SCL/1.3)+posY, SCL);
					}
				}
			}

			// Draw Grid Overlay
			if(grab('showGridOverlay').checked){
				gfx.shadowColor = 'rgba(0,0,0,0)';		
				gfx.shadowBlur = 0;
				gfx.strokeStyle = gridOverlayColor;
				gfx.lineWidth = grid.view.gridOverlayWidth;
				// horizontal grid lines
				for(var y=grid.model.dimY+1; y-->0;){
					// See this for why 0.5: http://goo.gl/EpuqLl
					gfx.beginPath();
					gfx.moveTo(layerPosX, 			 layerPosY+y*SCL+(y!=grid.model.dimY?0.5:-0.5));
					gfx.lineTo(layerPosX+layerWidth, layerPosY+y*SCL+(y!=grid.model.dimY?0.5:-0.5));
					gfx.closePath();
					gfx.stroke();
				}
				// vertical grid lines
				for(var x=grid.model.dimX+1; x-->0;){
					gfx.beginPath();
					gfx.moveTo(layerPosX+x*SCL+(x!=grid.model.dimX?0.5:-0.5), layerPosY);
					gfx.lineTo(layerPosX+x*SCL+(x!=grid.model.dimX?0.5:-0.5), layerPosY+layerHeight);
					gfx.closePath();
					gfx.stroke();
				}
			}
		}
	}
	// Layer layout and title bars have been updated
	grid.view.layersNeedUpdate = false;
	grid.updateTimelineView();
	
	grid.updateCharts(grid.view.currentTimeFrame, grid.view.viewBuffer);
}

grid.updateLayersView = function(){
	var ports = grid.model.ports;	// shorthand

	// Signal that layers layout & titles need to be redrawn
	grid.view.layersNeedUpdate = true;

	// Count total of visible layers
	var portsDisplayed = 0;
	for (var z=0; z<grid.model.dimZ; z++ ) // for each layer
		for (var i=ports.length;i-->0;)	// for each port
			portsDisplayed += (!grab('Layer'+z+'_Port'+ports[i]).checked || 
								grab('Layer'+z+'_Port'+ports[i]).disabled)  ? 0:1; 

	// Reset canvas
	grid.view.canvy.width  = (grid.model.dimX*SCL+grid.view.barWidth) *
							 grid.view.layoutColumns - grid.view.barWidth;
	grid.view.canvy.height = (grid.model.dimY*SCL+grid.view.barHeight)* 
							 Math.ceil(portsDisplayed/grid.view.layoutColumns);
				
	// Rewind and update grid view
	//grid.rewindPlayback(); // don't need to rewind everytime anymore :)
							 // thanks to grid.view.viewBuffer
	grid.view.redrawRequested = true;
	grid.updateGridView();
}

grid.toggleLayer = function(ID){
	var ports = grid.model.ports;	// shorthand

	var layer = grab('layer'+ID[0]),
		port  = grab('Layer'+ID[0]+'_Port'+ports[ID[1]]);

	if(ID[1] == -1){
		// Toggle entire layer with all its ports
		for (var i=ports.length;i-->0;)
			grab('Layer'+ID[0]+'_Port'+ports[i]).disabled = !layer.checked;
		// Redraw  layers on what just happened
		grid.updateLayersView();
	}else{
		// Redraw layers based on what just happened
		grid.updateLayersView();
	}
}

grid.updateLayoutColumns = function(){
	grid.view.layoutColumns = grab('layoutColumns').value;
	grid.view.layersNeedUpdate = true;
	grid.updateLayersView();
}
grid.toggleFixedPrecision = function(){
	// Only the view settings changed, but the frame data 
	// remains the same. Just request a redraw.
	grid.view.redrawRequested = true;
	grid.updateGridView();
}
grid.updatePrecision = function(){
	// Only the view settings changed, but the frame data 
	// remains the same. Just request a redraw.
	grid.view.redrawRequested = true;
	grid.updateGridView();
}
grid.toggleGridOverlay = function(){
	// Only the view settings changed, but the frame data 
	// remains the same. Just request a redraw.
	grid.view.redrawRequested = true;
	grid.updateGridView();
	grab('gridOverlayColor').disabled = !grab('showGridOverlay').checked;
}



grid.updateGridOverlayColor = function(){
	// Redraw the frame using the new colors
	grid.updateGridView();
}
grid.toggleLoop = function(){
	// If standing at last frame, assume user intends to play right away
	if(grab('loop').checked && grid.view.currentTimeFrame==grid.model.frameCount-1)
		grid.playFrames();
}
grid.nextFrame = function(){
	if(grid.view.currentTimeFrame<grid.model.frameCount-1){
		grid.view.currentTimeFrame++;
		grid.updateGridView();
	}
	else{
		// Loop back to first frame
		if(grab('loop').checked){
			grid.view.currentTimeFrame = 0;
			grid.updateGridView();
		} else
			grid.pausePlayback();	
	}
}

grid.prevFrame = function(){
	if(grid.view.CACHE_ENABLED){
		if(grid.view.currentTimeFrame>0){
			// Can only rewind to cache points
			grid.view.currentTimeFrame = previousCacheTime(--grid.view.currentTimeFrame);
			grid.updateGridView();
		}
		else{
			if(grab('loop').checked){
				grid.view.currentTimeFrame = grid.model.frameCount-1;
				grid.updateGridView();
			} else
				grid.pausePlayback();
		}
	}
}
grid.rewindPlayback = function(){
	//var previousState = grid.view.playbackDirection;
	grid.pausePlayback();
	grid.view.currentTimeFrame = 0;
	grid.updateGridView();
	//if (previousState == 1) //if we were already 'playing' before rewinding, continue playing
	//	grid.playFrames();
}
grid.lastFrame = function(){
	if(grid.view.CACHE_ENABLED){
		//var previousState = grid.view.playbackDirection;
		grid.pausePlayback();
		grid.view.currentTimeFrame = grid.model.frameCount-1;
		grid.updateGridView();
		//if (previousState == 1) //if we were already 'playing' before rewinding, continue playing
			//grid.playFrames();
	}
}
grid.playFrames = function(){
	// Don't set an interval if already playing forwards (1)
	if(grid.view.playbackDirection != 1){
		grid.pausePlayback();
		grid.view.playbackDirection = 1;
		grid.view.playbackHandle = setInterval(grid.nextFrame, grid.view.FPS);
		// Visual feedback
		grab('BtnPlay').style.backgroundColor='#335536';
		grab('BtnPlay').innerHTML = '<B>I</B> <B>I</B>';
		grab('BtnPlayBw').style.backgroundColor='';
		grab('BtnPlayBw').innerHTML = '&#x25C1;&#x25C1';
	}else{
		grid.pausePlayback();
	}
}

grid.playFramesBackwards = function(){
	// Don't set an interval if already playing backwards (2)
	if(grid.view.playbackDirection != 2){
		grid.pausePlayback(); // for reversing playback direction
		grid.view.playbackDirection = 2;
		grid.view.playbackHandle = setInterval(grid.prevFrame, grid.view.FPS);
		//Visual feedback
		grab('BtnPlayBw').style.backgroundColor='#335536';
		grab('BtnPlayBw').innerHTML='<B>I</B> <B>I</B>';
		grab('BtnPlay').style.backgroundColor='';
		grab('BtnPlay').innerHTML = '&#x25B6;';
	}else{
		grid.pausePlayback();
	}
}

grid.pausePlayback = function(){
	grid.view.playbackDirection = 0;
	clearInterval(grid.view.playbackHandle);
	// Visual feedback
	grab('BtnPlay').style.backgroundColor='';
	grab('BtnPlay').innerHTML = '&#x25B6';
	grab('BtnRecord').style.backgroundColor=''; 
	grab('BtnRecord').innerHTML='<b style="color:#A44A4A">&#x25cf;</b> Record Video';
	grab('BtnPlayBw').style.backgroundColor='';
	grab('BtnPlayBw').innerHTML = '&#x25C1;&#x25C1';
}


grid.recordFrames = function(){
	// Return if not in Desktop Chrome
	if(!(window.chrome && !window.opera) || /(android)/i.test(navigator.userAgent)){
		window.alert("Sorry, video recording is only supported on Desktop Chrome ;(");
		return;
	}
	if (grid.model.frameCount == 0) return;
	
	if(!grid.view.isRecording){
		//Create new video object (fps, quality [0-1])
		grid.view.video = new Whammy.Video(1000/grid.view.FPS, 1/*0+grab('vidQual').value*/); 
		grab('videoLink').style.display = 'none';
		grab('videoDownloadLink').style.display = 'none';
		grab('videoViewLink').style.display = 'none';
		grid.pausePlayback();
		grid.view.playbackDirection = 1;
		grid.view.playbackHandle = setInterval(grid.recordNextFrame,grid.view.FPS);
		grid.view.isRecording = true;
		// Visual feedback
		grab('BtnRecord').style.backgroundColor='#683535';
		grab('BtnRecord').innerHTML = '&#x25A0; Stop Recording';		

		// Disable timeline controls that might affect this
		grid.toggleUI(false, ['cellScale','BtnParseY','framerate','vidQual', 'showZero', 'layoutColumns',
						    'fixedPrecision', 'precision','loop','BtnRewind','BtnStepBw','BtnPlayBw',
						    'BtnPlay','BtnStepFw','BtnLastFrame','showValues','showGridOverlay',
						    'gridOverlayColor', 'timelineSeek','showStats', 'showTransitions','showStateFreq']);
							
	}
	else{
		// Stop recording here. Compile the whole video.
		grid.view.isRecording = false;
		grid.pausePlayback();
		grid.view.video.output = grid.view.video.compile();
		var vidURL = URL.createObjectURL(grid.view.video.output);
		grab('videoLink').style.display = 'inline';
		grab('videoDownloadLink').style.display = 'inline';
		grab('videoViewLink').style.display = 'inline';
		grab('videoDownloadLink').href = vidURL;
		grab('videoDownloadLink').download = grid.model.name+'.webm';
		grab('videoViewLink').onclick = function(){
			window.open(vidURL,"_blank","width="+grid.view.canvy.width+",height="+grid.view.canvy.height);
			return;
		}

		// renable the timeline buttons
		grid.toggleUI(true, ['cellScale','BtnParseY','framerate','vidQual', 'showZero', 'layoutColumns',
						   'fixedPrecision', 'precision','loop','BtnRewind','BtnStepBw','BtnPlayBw',
						   'BtnPlay','BtnStepFw','BtnLastFrame','showValues','showGridOverlay',
						   'gridOverlayColor', 'timelineSeek','showStats', 'showTransitions','showStateFreq']);
		// Disable random access and backwards playback if cache is disabled
		if(!grid.view.CACHE_ENABLED)
			grid.toggleUI(false, ['timelineSeek','BtnPlayBw','BtnStepBw','BtnLastFrame']);
	}
}

grid.toggleUI = function(isEnabled, list){
	for(var i=list.length;i-->0;)
		grab(list[i]).disabled = !isEnabled;
}

grid.recordNextFrame = function(){
	if(grid.view.currentTimeFrame<grid.model.frameCount-1){
		// Record this image frame
		grid.view.video.add(grid.view.gfx);
		grid.view.currentTimeFrame++;
		grid.updateGridView();
		return;
	}
	else if(grid.view.currentTimeFrame==grid.model.frameCount-1){
		// Add last frame
		grid.view.video.add(grid.view.gfx);
	}

	// End of timeline. Compile the whole video.
	// Stop recording here. Compile the whole video.
	// Stop recording here. Compile the whole video.
	grid.view.isRecording = false;
	grid.pausePlayback();
	grid.view.video.output = grid.view.video.compile();
	var vidURL = URL.createObjectURL(grid.view.video.output);
	grab('videoLink').style.display = 'inline';
	grab('videoDownloadLink').style.display = 'inline';
	grab('videoViewLink').style.display = 'inline';
	grab('videoDownloadLink').href = vidURL;
	grab('videoDownloadLink').download = grid.model.name+'.webm';
	grab('videoViewLink').onclick = function(){
		window.open(vidURL,"_blank","width="+grid.view.canvy.width+",height="+grid.view.canvy.height);
		return;
	}

	// renable the timeline buttons
	grid.toggleUI(true, ['cellScale','BtnParseY','framerate','vidQual', 'showZero', 'layoutColumns',
						  'fixedPrecision', 'precision','loop','BtnRewind','BtnStepBw','BtnPlayBw',
						  'BtnPlay','BtnStepFw','BtnLastFrame','showValues','showGridOverlay',
						  'gridOverlayColor', 'timelineSeek','showStats', 'showTransitions','showStateFreq']);
	// Disable random access and backwards playback if cache is disabled
	if(!grid.view.CACHE_ENABLED)
		grid.toggleUI(false, ['timelineSeek','BtnPlayBw','BtnStepBw','BtnLastFrame']);
}

grid.updateTimelineView = function(){
	var seek = grab('timelineSeek');	// shorthand
	seek.max = grid.model.frameCount-1;
	seek.value = this.view.currentTimeFrame;
	if(seek.value == seek.max) {// force slider to refresh
		seek.stepDown(1); seek.stepUp(1);
	}else{
		seek.stepUp(1); seek.stepDown(1);
	}
	
	if(grid.model.data.length){
		var t = this.model.data[this.view.currentTimeFrame].timestamp; //shorthand
		grab('timelineStatus').innerHTML = 'Frame: ' + this.view.currentTimeFrame +
				'&emsp;&emsp; Time: ' + util.padInt2(t[0]) +':'+ util.padInt2(t[1]) + ':' +
				 					 	util.padInt2(t[2]) +':'+ util.padInt3(t[3]);
	}
	// [TODO] Timestamp arithmetic & display 
	// (although this is just a viewer and should obey sim data source)
}

grid.updateFPS = function(){
	grid.view.FPS = 1000/grab('framerate').value;
	if(grid.view.playbackDirection){  // If playing, pause and reset it for new FPS
		var i = grid.view.playbackDirection;
		grid.pausePlayback();
		if(i<2)	grid.playFrames();
		else grid.playFramesBackwards();
	}
}

grid.seekTimeline = function(){
	if(grid.view.CACHE_ENABLED){
		// Record playback direction
		var i = grid.view.playbackDirection;
		// Pause and seek along user input
		grid.pausePlayback();
		// Jump to the nearest cache point and update the view
		grid.view.currentTimeFrame = nearestCacheTime(grab('timelineSeek').value);
		grid.updateGridView();
		if(i){  // If timeline was playing before user started seeking, continue playback
			if(i<2)	grid.playFrames();
			else grid.playFramesBackwards();
		}
	}
}



grid.toggleValueDisplay = function(){
	this.view.valueDisplay = !this.view.valueDisplay;
	grab('showZero').disabled = !this.view.valueDisplay;

	//grid.rewindPlayback(); // don't need to rewind everytime anymore :)
							 // thanks to grid.view.viewBuffer
	grid.view.redrawRequested = true;
	grid.updateGridView();
}

grid.toggleZeroDisplay = function(){
	this.view.zeroDisplay = !this.view.zeroDisplay;
	grid.view.redrawRequested = true;
	grid.updateGridView();
}

grid.reCSSGrid = function(that){
	if(inp.logParsed){
		if(SCL>that.value)
			window.scrollTo(
				window.pageXOffset-(grid.model.dimX*grid.view.layoutColumns),
				window.pageYOffset
			);
		SCL = that.value;
		grid.view.layersNeedUpdate = true;
		grid.updateLayersView();
	}
}

util.randInt = function(max){return Math.round(max*Math.random())+1; /* +1 to avoid 0*/}

util.padInt2 = function(num){	// from 'Robin' on StackOverflow
	if(num <= 99)
		num = ("0"+num).slice(-2);
	return num;
}
util.padInt3 = function(num){	// from 'Robin' on StackOverflow
	if(num <= 999)
		num = ("00"+num).slice(-3);
	return num;
}

// Sticky the timeline controls
grid.stickyControls = function(){
	var	headerTop = grab('header').clientHeight,
		headerLeft= grab('header').clientWidth,
		scrollTop = window.pageYOffset,
		scrollLeft= window.pageXOffset,
		controls  = grab('stickyDiv');
	/* (window.pageYOffset !== undefined) ?
	 window.pageYOffset : (document.documentElement 
	 || document.body.parentNode || document.body).scrollTop;*/
	if(scrollTop-headerTop > 0){
		controls.style.top = (scrollTop-headerTop)+'px';
		controls.style.boxShadow = '0px 3px 5px #222';
	}
	else{
		controls.style.top = 0;
		controls.style.boxShadow = 'none';
	}
	controls.style.left = scrollLeft +'px';
}
window.onscroll = grid.stickyControls; 
//window.onresize = stickyControls; 

grid.initialView = function(){
	// Initialization after page and scritps load, but before any user interaction
	grid.toggleUI(false, ['precision','BtnRecord','BtnPlay','timelineSeek',
						  'fixedPrecision','precision','loop','BtnRewind', 
						  'BtnPlayBw','BtnStepBw','BtnStepFw','BtnLastFrame',
						  'showValues','showZero','showGridOverlay','layoutColumns']);

	// Record useragent string (for browser-specific customizations)
	document.documentElement.setAttribute('data-UA', navigator.userAgent);
}
grid.initialView();

// View main
grid.viewMain = function(){	
	grid.setupGrid();
	grid.setupCharts();
	grid.updateGridView();
}

// Bruno's Stuff
grid.getColor = function(value) {
	for (var i = 0; i < grid.palette.length; i++) {
		var mmax = grid.palette[i][0];
		
		if (value < mmax[0] || value >= mmax[1]) continue;
		
		return d3.color("rgb(" + grid.palette[i][1].join(",") + ")");
	}

	return d3.color("rgb(255,255,255)");
}

grid.setupCharts = function() {	
	var radio = grab('Layer_0_Port_0_Chart');
	
	if (radio) radio.checked = true;
	
	grid.toggleCharts(0, 0);
}

grid.toggleCharts = function(z, port) {
	Viz.Utils.empty("chartsDiv");
	
	var track = JSON.parse("[" + grab('chart_states').value.replace(/\s/g, '').split(",") + "]");
	
	var fb = grid.view.viewBuffer;
	
	Viz.data.Initialize(z, port, track);
	if(grab('showStateFreq').checked) charts.states = Viz.charting.BuildStatesChart(grab('chartsDiv'), "state", [70, 40, 20, 50]);
	if(grab('showTransitions').checked) charts.transitions = Viz.charting.BuildTransitionsChart(grab('chartsDiv'), "activity", [50, 50, 50, 50]);
	if(grab('showStats').checked) stats = Viz.stats.Build(grab('chartsDiv'), Viz.data);
	grid.updateGridView();
}

grid.updateCharts = function(t, fb) {	
	Viz.data.UpdateTime(t, fb);
	
	if(grab('showStateFreq').checked) charts.states.Update(Viz.data.StatesAsArray());
	if(grab('showTransitions').checked) charts.transitions.Update(Viz.data.TransitionAsArray());
	if(grab('showStats').checked) stats.Update(Viz.data.t, Viz.data.states);
}

function grab(id)	{return document.getElementById(id);}