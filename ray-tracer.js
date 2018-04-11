// CS 174a Project 3 Ray Tracer

var mult_3_coeffs = function( a, b ) { return [ a[0]*b[0], a[1]*b[1], a[2]*b[2] ]; };       // Convenient way to combine two color-reducing vectors

Declare_Any_Class( "Ball",              // The following data members of a ball are filled in for you in Ray_Tracer::parse_line():
  { 'construct'( position, size, color, k_a, k_d, k_s, n, k_r, k_refract, refract_index )
      { this.define_data_members( { position, size, color, k_a, k_d, k_s, n, k_r, k_refract, refract_index} );
 
  // TODO:  Finish filling in data members, using data already present in the others.
        this.model_transform = mult(identity(), mult(translation(this.position), scale(this.size)));
		
		//this.scale_mat = mult(identity(), mult(scale(this.size)));
		// declare inverse during construction to avoid crazy lagggg
		this.inv_transform = inverse(mult(identity(), mult(translation(this.position), scale(this.size))));
      },
    'intersect'( ray, existing_intersection, minimum_dist )
      {
  // TODO:  Given a ray, check if this Ball is in its path.  Recieves as an argument a record of the nearest intersection found so far (a Ball pointer, a t distance
  //        value along the ray, and a normal), updates it if needed, and returns it.  Only counts intersections that are at least a given distance ahead along the ray.
  //        Tip:  Once intersect() is done, call it in trace() as you loop through all the spheres until you've found the ray's nearest available intersection.  Simply
  //        return a dummy color if the intersection tests positiv.  This will show the spheres' outlines, giving early proof that you did intersect() correctly.
		
		// Put ray into ball's CS
		var iray_dir = mult_vec(this.inv_transform, ray.dir);
		var iray_origin = mult_vec(this.inv_transform, ray.origin);
		
		// Use quadratic formula
		var c_sq = dot(iray_dir.slice(0,3), iray_dir.slice(0,3));
		var s_dot_c = dot(iray_origin.slice(0,3), iray_dir.slice(0,3));
		var s_sq_min_one = dot(iray_origin.slice(0,3), iray_origin.slice(0,3)) - 1;
		
		var det = (s_dot_c * s_dot_c) - (c_sq * s_sq_min_one);
		
		// Ball hit by ray (though not necessarily obstructed)
		if (det >= 0) {
			var t1 = -(s_dot_c/c_sq) - Math.sqrt(det)/c_sq;
			var t2 = -(s_dot_c/c_sq) + Math.sqrt(det)/c_sq;
			var t_ret = t1;
			
			if (t1 < minimum_dist)
			{
				t_ret = t2;
			}
			if (t_ret < minimum_dist || t_ret >= existing_intersection.distance)
			{
				return existing_intersection;
			}
			
			existing_intersection.ball = this;
			existing_intersection.distance = t_ret;
			existing_intersection.normal = normalize(mult_vec(transpose(this.inv_transform), add(iray_origin, scale_vec(t_ret, iray_dir))).slice(0,3));
			
			/*
			Hi i am an idiot who didn't know how to slice a vec4
			and spent half a day trying to figure out why alll the normals weren't working
			console.log(existing_intersection.normal);
			console.log(iray_dir);
			
			console.log(iray_dir.slice(0,3));
			*/
			
			// check inside? flip normal -1
			if (dot((existing_intersection.normal), iray_dir.slice(0,3)) > 0)
			{
				existing_intersection.normal = scale_vec(-1, existing_intersection.normal);
			}
		}
		
        return existing_intersection;
      }
  } );

Declare_Any_Class( "Ray_Tracer",
  { 'construct'( context )
      { this.define_data_members( { width: 32, height: 32, near: 1, left: -1, right: 1, bottom: -1, top: 1, ambient: [.1, .1, .1],
                                    balls: [], lights: [], curr_background_function: "color", background_color: [0, 0, 0, 1 ],
                                    scanline: 0, visible: true, scratchpad: document.createElement('canvas'), gl: context.gl,
                                    shader: context.shaders_in_use["Phong_Model"] } );
        var shapes = { "square": new Square(),                  // For texturing with and showing the ray traced result
                       "sphere": new Subdivision_Sphere( 4 ) };   // For drawing with ray tracing turned off
        this.submit_shapes( context, shapes );

        this.texture = new Texture ( context.gl, "", false, false );           // Initial image source: Blank gif file
        this.texture.image.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        context.textures_in_use[ "procedural" ]  =  this.texture;

        this.scratchpad.width = this.width;  this.scratchpad.height = this.height;
        this.imageData          = new ImageData( this.width, this.height );     // Will hold ray traced pixels waiting to be stored in the texture
        this.scratchpad_context = this.scratchpad.getContext('2d');             // A hidden canvas for assembling the texture

        this.background_functions =                 // These convert a ray into a color even when no balls were struck by the ray.
          { waves: function( ray )
            { return Color( .5*Math.pow( Math.sin( 2*ray.dir[0] ), 4 ) + Math.abs( .5*Math.cos( 8*ray.dir[0] + Math.sin( 10*ray.dir[1] ) + Math.sin( 10*ray.dir[2] ) ) ),
                            .5*Math.pow( Math.sin( 2*ray.dir[1] ), 4 ) + Math.abs( .5*Math.cos( 8*ray.dir[1] + Math.sin( 10*ray.dir[0] ) + Math.sin( 10*ray.dir[2] ) ) ),
                            .5*Math.pow( Math.sin( 2*ray.dir[2] ), 4 ) + Math.abs( .5*Math.cos( 8*ray.dir[2] + Math.sin( 10*ray.dir[1] ) + Math.sin( 10*ray.dir[0] ) ) ), 1 );
            },
            lasers: function( ray ) 
            { var u = Math.acos( ray.dir[0] ), v = Math.atan2( ray.dir[1], ray.dir[2] );
              return Color( 1 + .5 * Math.cos( 20 * ~~u  ), 1 + .5 * Math.cos( 20 * ~~v ), 1 + .5 * Math.cos( 8 * ~~u ), 1 );
            },
            mixture:     ( function( ray ) { return mult_3_coeffs( this.background_functions["waves" ]( ray ), 
                                                                   this.background_functions["lasers"]( ray ) ).concat(1); } ).bind( this ),
            ray_direction: function( ray ) { return Color( Math.abs( ray.dir[ 0 ] ), Math.abs( ray.dir[ 1 ] ), Math.abs( ray.dir[ 2 ] ), 1 );  },
            color:       ( function( ray ) { return this.background_color;  } ).bind( this )
          };       
        this.make_menu();
        this.load_case( "show_homework_spec" );
      },
    'get_dir'( ix, iy )   
      {
    // TODO:  Map an (x,y) pixel to a corresponding xyz vector that reaches the near plane.  If correct, everything under the "background effects" menu will now work. 
         // Direction from origin to pixel (ix, iy)
		 // Normalize vector? Nope that looks weird
		 
		 var x = this.left + ((ix/this.width)*(this.right - this.left));
		 var y = this.bottom + ((iy/this.height)*(this.top-this.bottom));
		 var dir = vec4(x, y, -this.near, 0);
		 
		 return dir;
		 //return normalize(dir, false);
		 
         //return vec4( 0, 0, -1, 0 );
      },
    'color_missed_ray'( ray ) { return mult_3_coeffs( this.ambient, this.background_functions[ this.curr_background_function ] ( ray ) ).concat(1); },
    'trace'( ray, color_remaining, is_primary, light_to_check = null )
      {
		  /*
    // TODO:  Given a ray, return the color in that ray's path.  The ray either originates from the camera itself or from a secondary reflection or refraction off of a
    //        ball.  Call Ball.prototype.intersect on each ball to determine the nearest ball struck, if any, and perform vector math (the Phong reflection formula)
    //        using the resulting intersection record to figure out the influence of light on that spot.  Recurse for reflections and refractions until the final color
    //        is no longer significantly affected by more bounces.
    //
    //        Arguments besides the ray include color_remaining, the proportion of brightness this ray can contribute to the final pixel.  Only if that's still
    //        significant, proceed with the current recursion, computing the Phong model's brightness of each color.  When recursing, scale color_remaining down by k_r
    //        or k_refract, multiplied by the "complement" (1-alpha) of the Phong color this recursion.  Use argument is_primary to indicate whether this is the original
    //        ray or a recursion.  Use the argument light_to_check when a recursive call to trace() is for computing a shadow ray.
        */
        if( length( color_remaining ) < 0.3 )    return Color( 0, 0, 0, 1 );  // Each recursion, check if there's any remaining potential for the pixel to be brightened.

        var closest_intersection = { distance: Number.POSITIVE_INFINITY, ball: null, normal: null }    // An empty intersection object
        
		for (let b of this.balls){
			if (is_primary)
				closest_intersection = b.intersect(ray, closest_intersection, 1);
			else
				closest_intersection = b.intersect(ray, closest_intersection, 0.0001);
			
		}
		
		// handle shadow rays
		if (light_to_check) 
		{
			if (closest_intersection.distance < length(subtract(light_to_check.position, ray.origin)))
				return 'shadow';
			else
				return 'not a shadow';
		}
		
        if( !closest_intersection.ball ) return this.color_missed_ray( ray ); 
		
		// AMBIENT GLOW FROM BALLS
		var rref_origin = add(ray.origin, scale_vec(closest_intersection.distance, ray.dir));
		var r_to_origin = normalize(subtract(ray.origin, rref_origin).slice(0,3));
		
		// Sphere COLOR
		var pix_amb_lights = scale_vec(closest_intersection.ball.k_a, closest_intersection.ball.color);
		
		/*
		for (var i = 0; i < 3; i++) {
			if (pix_ambient[i] > 1) 
				pix_ambient[i] = 1;
			if (pix_ambient[i] < 0) 
				pix_ambient[i] = 0;
		}
		*/
		//console.log(pix_ambient);
		
		// LOCAL ILLUMINATION
		// Go through all light sources... what does each light source add to a pixel, if it hits a ball?
		for (let lite of this.lights) {
			var lightref = normalize(subtract(lite.position, rref_origin).slice(0,3));
			var light_ray = {
				'origin': rref_origin,
				'dir': lightref.concat(0)
			};
			
			
			if (this.trace(light_ray, vec3(1,1,1), true, lite) == 'shadow') {
				// uhhhh check this it sesems to be working as intended....
				continue;
			}
			
			
			var lref_to_origin = normalize(add(lightref, r_to_origin));
			var refl_light = subtract(lightref, scale_vec(2*dot(lightref, closest_intersection.normal), closest_intersection.normal));
			
			// adds the diffused light color and the shined light (reflectivity light things)
			// Surface COLOR
			// R dot V instead
			
			var n_dot_l = dot(lightref, closest_intersection.normal);
			var r_dot_v = dot(refl_light, r_to_origin);
			var diffuse = Math.max(n_dot_l, 0);
			var specular = Math.min(r_dot_v, 0);
			
			// sorry this was for testing purposes but like... I'm not gonna delete it yolo
			var pix_diffuse = mult_3_coeffs(lite.color,
											scale_vec(closest_intersection.ball.k_d * diffuse,
														closest_intersection.ball.color));
			pix_amb_lights = add(	pix_amb_lights, 
										(mult_3_coeffs(	lite.color, 
														add(scale_vec(	(closest_intersection.ball.k_d * diffuse),
																		closest_intersection.ball.color),
															scale_vec(	(closest_intersection.ball.k_s * Math.pow(specular, closest_intersection.ball.n)),
																		vec3(1,1,1))
														)
													)
										)
									);
			//console.log(pix_ambient);
		} // END local illumination
		
		
		// Hi how are you
		// At this point, the following are sources of color for a pixel
		// 1. Ambient Glow of Balls
		// 2. Light sources that are (a) diffused and (b) shined on the Balls
		
		// sanity check, clamp colors to max and min values (between 1 - 0)
		
		for (var i = 0; i < 3; i++) {
			if (pix_amb_lights[i] > 1) 
				pix_amb_lights[i] = 1;
			if (pix_amb_lights[i] < 0) 
				pix_amb_lights[i] = 0;
		}
		
		var pix_check = pix_amb_lights;
		
		// REFRACTED and REFLECTED LIGHT (time to overflow the stack amirite)
		/*
			death_ray : refracted
			death_ray2 : reflected
			
			rays are passed to new trace functions, recurse through until the color_remaining
			is negligible
		
		*/
		var bounce_dot = dot(closest_intersection.normal, normalize(ray.dir.slice(0,3)));
		var death_ray = add(scale_vec(closest_intersection.ball.refract_index, normalize(ray.dir).slice(0,3)),
							scale_vec(	-closest_intersection.ball.refract_index * bounce_dot - 
											Math.sqrt(1 - closest_intersection.ball.refract_index * closest_intersection.ball.refract_index * (1 - bounce_dot * bounce_dot)),
										closest_intersection.normal));
		var death_ray2;
		if (bounce_dot < 0)
			death_ray2 = scale_vec(-1, subtract(scale_vec(2 * bounce_dot, closest_intersection.normal), normalize(ray.dir).slice(0,3)));
		else
			death_ray2 = scale_vec(1, subtract(scale_vec(2 * bounce_dot, closest_intersection.normal), normalize(ray.dir).slice(0,3)));
        
		// COMPLETE PIXEL COLOR CALCULATED
		
		var pix_color = add(pix_amb_lights,
							mult_3_coeffs(	subtract([1,1,1], pix_amb_lights),
											add(scale_vec(closest_intersection.ball.k_r, 
												  this.trace(	{'origin': rref_origin, 'dir':death_ray2.concat(0)},
															scale_vec(closest_intersection.ball.k_r, mult_3_coeffs(color_remaining, subtract([1,1,1], pix_amb_lights))),
															false).slice(0,3)),
												scale_vec(closest_intersection.ball.k_refract,
												  this.trace( {'origin': rref_origin, 'dir':death_ray.concat(0)},
															scale_vec(closest_intersection.ball.k_refract, mult_3_coeffs(color_remaining, subtract([1,1,1], pix_amb_lights))),
															false).slice(0,3))
												)
											)
							);
		
		
        return pix_color.concat(1);
	  
      },
    'parse_line'( tokens )            // Load the lines from the textbox into variables
      { for( let i = 1; i < tokens.length; i++ ) tokens[i] = Number.parseFloat( tokens[i] );
        switch( tokens[0] )
          { case "NEAR":    this.near   = tokens[1];  break;
            case "LEFT":    this.left   = tokens[1];  break;
            case "RIGHT":   this.right  = tokens[1];  break;
            case "BOTTOM":  this.bottom = tokens[1];  break;
            case "TOP":     this.top    = tokens[1];  break;
            case "RES":     this.width             = tokens[1];   this.height            = tokens[2]; 
                            this.scratchpad.width  = this.width;  this.scratchpad.height = this.height; break;
            case "SPHERE":
              this.balls.push( new Ball( [tokens[1], tokens[2], tokens[3]], [tokens[4], tokens[5], tokens[6]], [tokens[7],tokens[8],tokens[9]], 
                                          tokens[10],tokens[11],tokens[12],  tokens[13],tokens[14],tokens[15],  tokens[16] ) ); break;
            case "LIGHT":   this.lights.push( new Light( [ tokens[1],tokens[2],tokens[3], 1 ], Color( tokens[4],tokens[5],tokens[6], 1 ),    10000000 ) ); break;
            case "BACK":    this.background_color = Color( tokens[1],tokens[2],tokens[3], 1 ); this.gl.clearColor.apply( this.gl, this.background_color ); break;
            case "AMBIENT": this.ambient = [tokens[1], tokens[2], tokens[3]];          
          }
      },
    'parse_file'()        // Move through the text lines
      { this.balls = [];   this.lights = [];
        this.scanline = 0; this.scanlines_per_frame = 1;                            // Begin at bottom scanline, forget the last image's speedup factor
        document.getElementById("progress").style = "display:inline-block;";        // Re-show progress bar
        this.camera_needs_reset = true;                                             // Reset camera
        var input_lines = document.getElementById( "input_scene" ).value.split("\n");
        for( let i of input_lines ) this.parse_line( i.split(/\s+/) );
      },
    'load_case'( i ) {   document.getElementById( "input_scene" ).value = test_cases[ i ];   },
    'make_menu'()
      { document.getElementById( "raytracer_menu" ).innerHTML = "<span style='white-space: nowrap'> \
          <button id='toggle_raytracing' class='dropbtn' style='background-color: #AF4C50'>Toggle Ray Tracing</button> \
          <button onclick='document.getElementById(\"myDropdown2\").classList.toggle(\"show\"); return false;' class='dropbtn' style='background-color: #8A8A4C'> \
          Select Background Effect</button><div  id='myDropdown2' class='dropdown-content'>  </div>\
          <button onclick='document.getElementById(\"myDropdown\" ).classList.toggle(\"show\"); return false;' class='dropbtn' style='background-color: #4C50AF'> \
          Select Test Case</button        ><div  id='myDropdown' class='dropdown-content'>  </div> \
          <button id='submit_scene' class='dropbtn'>Submit Scene Textbox</button> \
          <div id='progress' style = 'display:none;' ></div></span>";
        for( let i in test_cases )
          { var a = document.createElement( "a" );
            a.addEventListener("click", function() { this.load_case( i ); this.parse_file(); }.bind( this    ), false);
            a.innerHTML = i;
            document.getElementById( "myDropdown"  ).appendChild( a );
          }
        for( let j in this.background_functions )
          { var a = document.createElement( "a" );
            a.addEventListener("click", function() { this.curr_background_function = j;      }.bind( this, j ), false);
            a.innerHTML = j;
            document.getElementById( "myDropdown2" ).appendChild( a );
          }
        
        document.getElementById( "input_scene" ).addEventListener( "keydown", function(event) { event.cancelBubble = true; }, false );
        
        window.addEventListener( "click", function(event) {  if( !event.target.matches('.dropbtn') ) {    
          document.getElementById( "myDropdown"  ).classList.remove("show");
          document.getElementById( "myDropdown2" ).classList.remove("show"); } }, false );

        document.getElementById( "toggle_raytracing" ).addEventListener("click", this.toggle_visible.bind( this ), false);
        document.getElementById( "submit_scene"      ).addEventListener("click", this.parse_file.bind(     this ), false);
      },
    'toggle_visible'() { this.visible = !this.visible; document.getElementById("progress").style = "display:inline-block;" },
    'set_color'( ix, iy, color )                           // Sends a color to one pixel index of our final result
      { var index = iy * this.width + ix;
        this.imageData.data[ 4 * index     ] = 255.9 * color[0];    
        this.imageData.data[ 4 * index + 1 ] = 255.9 * color[1];    
        this.imageData.data[ 4 * index + 2 ] = 255.9 * color[2];    
        this.imageData.data[ 4 * index + 3 ] = 255;  
      },
    'init_keys'( controls ) { controls.add( "SHIFT+r", this, this.toggle_visible ); },
    'display'( graphics_state )
      { graphics_state.lights = this.lights;
		//console.log(this.lights);
        graphics_state.projection_transform = perspective(90, 1, 1, 1000);
        if( this.camera_needs_reset ) { graphics_state.camera_transform = identity(); this.camera_needs_reset = false; }
        
        if( !this.visible )                          // Raster mode, to draw the same shapes out of triangles when you don't want to trace rays
        { for( let b of this.balls ) this.shapes.sphere.draw( graphics_state, b.model_transform, this.shader.material( b.color.concat(1), b.k_a, b.k_d, b.k_s, b.n ) );
          this.scanline = 0;    document.getElementById("progress").style = "display:none";     return; 
        } 
        if( !this.texture || !this.texture.loaded ) return;      // Don't display until we've got our first procedural image
        this.scratchpad_context.drawImage( this.texture.image, 0, 0 );
        this.imageData = this.scratchpad_context.getImageData( 0, 0, this.width, this.height );    // Send the newest pixels over to the texture
        var camera_inv = inverse( graphics_state.camera_transform );
        
        var desired_milliseconds_per_frame = 100;
        if( ! this.scanlines_per_frame ) this.scanlines_per_frame = 1;
        var milliseconds_per_scanline = Math.max( graphics_state.animation_delta_time / this.scanlines_per_frame, 1 );
        this.scanlines_per_frame = desired_milliseconds_per_frame / milliseconds_per_scanline + 1;
        for( var i = 0; i < this.scanlines_per_frame; i++ )     // Update as many scanlines on the picture at once as we can, based on previous frame's speed
        { var y = this.scanline++;
          if( y >= this.height ) { this.scanline = 0; document.getElementById("progress").style = "display:none" };
          document.getElementById("progress").innerHTML = "Rendering ( " + 100 * y / this.height + "% )..."; 
          for ( var x = 0; x < this.width; x++ )
          { var ray = { 
				origin: mult_vec( camera_inv, vec4(0, 0, 0, 1) ), 
				dir: mult_vec( camera_inv, this.get_dir( x, y ) ) };   // Apply camera
            this.set_color( x, y, this.trace( ray, [1,1,1], true ) );                                    // ******** Trace a single ray *********
          }
        }
        this.scratchpad_context.putImageData( this.imageData, 0, 0);          // Draw the image on the hidden canvas
        this.texture.image.src = this.scratchpad.toDataURL("image/png");      // Convert the canvas back into an image and send to a texture
        
        this.shapes.square.draw( new Graphics_State( identity(), identity(), 0 ), translation(0,0,-1), this.shader.material( Color( 0, 0, 0, 1 ), 1,  0, 0, 1, this.texture ) );
      }
  }, Scene_Component );
