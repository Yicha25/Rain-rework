(function() {
    let rainCollection = null;
    let rainDrops = [];
    let updateListener = null;
    let precipitationWatcher = null;
    const BASE_DROPS = 3600;
    const SPAWN_RADIUS = 600;
    const SPAWN_HEIGHT = 150;
    
    let customRainIntensity = 0;
    
    function createRainSlider() {
        const sliderContainer = document.createElement('div');
        sliderContainer.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            padding: 15px;
            border-radius: 8px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 10000;
            min-width: 200px;
        `;
        

        const title = document.createElement('div');
        title.textContent = 'Rain Rework';
        title.style.cssText = 'margin-bottom: 10px; font-weight: bold; font-size: 14px;';
        sliderContainer.appendChild(title);
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = '0';
        slider.style.cssText = 'width: 100%; margin-bottom: 8px;';
        sliderContainer.appendChild(slider);
        
        const valueDisplay = document.createElement('div');
        valueDisplay.textContent = 'Intensity: 0%';
        valueDisplay.style.cssText = 'font-size: 12px; color: #aaa;';
        sliderContainer.appendChild(valueDisplay);
        
        slider.addEventListener('input', function() {
            const value = parseInt(slider.value);
            customRainIntensity = value / 100;
            valueDisplay.textContent = 'Intensity: ' + value + '%';
            updateRain();
        });
        
        document.body.appendChild(sliderContainer);
        
        console.log("Custom rain slider created");
    }
    
    function startRain(intensity) {
        const viewer = window.geofs?.ceviewer || window.geofs?.api?.viewer;
        if (!viewer || intensity <= 0) return;
        
        const numDrops = Math.floor(BASE_DROPS * intensity);
        
        rainCollection = new Cesium.PolylineCollection();
        viewer.scene.primitives.add(rainCollection);
        
        const lla = geofs.aircraft.instance.llaLocation;
        
        rainDrops = [];
        for (let i = 0; i < numDrops; i++) {
            const randomDist = Math.random() * SPAWN_RADIUS;
            const randomAngle = Math.random() * Math.PI * 2;
            const offsetX = Math.cos(randomAngle) * randomDist;
            const offsetY = Math.sin(randomAngle) * randomDist;
            
            const drop = {
                lon: lla[1] + offsetX / 111320,
                lat: lla[0] + offsetY / 110540,
                alt: lla[2] + Math.random() * SPAWN_HEIGHT * 2,
                polyline: null
            };
            
            drop.polyline = rainCollection.add({
                positions: [
                    Cesium.Cartesian3.ZERO.clone(),
                    Cesium.Cartesian3.ZERO.clone()
                ],
                width: 1,
                material: Cesium.Material.fromType('Color', {
                    color: Cesium.Color.LIGHTCYAN.withAlpha(0.3 * intensity)
                })
            });
            
            rainDrops.push(drop);
        }
        
        updateListener = viewer.scene.preUpdate.addEventListener(function(scene, time) {
            if (!geofs.aircraft.instance || !rainCollection) return;
            
            const lla = geofs.aircraft.instance.llaLocation;
            const kias = geofs.animation.values.kias || 0;
            const heading = geofs.animation.values.heading || 0;
            const speedMS = kias * 0.5144;
            
            const dt = 0.3;
            

            const speedFactor = Math.max(0.2, 1 - (kias / 250));
            const fallSpeed = 9.6 * speedFactor;
            
            const streakLength = 8 + (speedMS * 0.3);
            
            const headingRad = heading * Math.PI / 180;
            
            const apparentWindX = -Math.sin(headingRad) * speedMS;
            const apparentWindY = -Math.cos(headingRad) * speedMS;
            
            const rainFallSpeed = 9.6 * speedFactor;
            
            const totalVelocity = Math.sqrt(apparentWindX * apparentWindX + 
                                           apparentWindY * apparentWindY + 
                                           rainFallSpeed * rainFallSpeed);
            const dirX = apparentWindX / totalVelocity;
            const dirY = apparentWindY / totalVelocity;
            const dirZ = -rainFallSpeed / totalVelocity;
            
            for (let i = 0; i < rainDrops.length; i++) {
                const drop = rainDrops[i];
                
                drop.alt -= fallSpeed * dt;
                
                const globe = viewer.scene.globe;
                const cartographic = Cesium.Cartographic.fromDegrees(drop.lon, drop.lat);
                const groundHeight = globe.getHeight(cartographic) || 0;
                
                const distFromPlane = Math.sqrt(
                    Math.pow((drop.lon - lla[1]) * 111320, 2) +
                    Math.pow((drop.lat - lla[0]) * 110540, 2)
                );
                
                if (drop.alt <= groundHeight || distFromPlane > SPAWN_RADIUS * 1.5) {
                    const randomDist = Math.random() * SPAWN_RADIUS;
                    const randomAngle = Math.random() * Math.PI * 2;
                    const offsetX = Math.cos(randomAngle) * randomDist;
                    const offsetY = Math.sin(randomAngle) * randomDist;
                    
                    drop.lon = lla[1] + offsetX / 111320;
                    drop.lat = lla[0] + offsetY / 110540;
                    drop.alt = lla[2] + SPAWN_HEIGHT + Math.random() * SPAWN_HEIGHT;
                }
                
                const startPos = Cesium.Cartesian3.fromDegrees(
                    drop.lon,
                    drop.lat,
                    drop.alt
                );
                
                const endPos = Cesium.Cartesian3.fromDegrees(
                    drop.lon + (dirX * streakLength) / 111320,
                    drop.lat + (dirY * streakLength) / 110540,
                    drop.alt + dirZ * streakLength
                );
                
                drop.polyline.positions = [startPos, endPos];
                
                const camPos = viewer.camera.position;
                const dist = Cesium.Cartesian3.distance(startPos, camPos);
                const alpha = Math.max(0.05, Math.min(0.4, 1 - dist / 400)) * intensity;
                
                drop.polyline.material = Cesium.Material.fromType('Color', {
                    color: Cesium.Color.LIGHTCYAN.withAlpha(alpha)
                });
            }
        });
        
        console.log("Custom rain enabled - " + numDrops + " drops (" + Math.round(intensity * 100) + "% intensity)");
    }
    
    function stopRain() {
        const viewer = window.geofs?.ceviewer || window.geofs?.api?.viewer;
        if (!viewer) return;
        
        if (updateListener) {
            updateListener();
            updateListener = null;
        }
        
        if (rainCollection) {
            viewer.scene.primitives.remove(rainCollection);
            rainCollection = null;
        }
        
        rainDrops = [];
    }
    
    function updateRain() {
        if (customRainIntensity > 0) {
            if (typeof geofs !== 'undefined' && geofs.preferences) {
                geofs.preferences.weather.advanced.precipitationAmount = 0;
            }
        }
        
        if (customRainIntensity > 0) {
            if (rainCollection) {
                stopRain();
            }
            startRain(customRainIntensity);
        } else {
            if (rainCollection) {
                stopRain();
            }
        }
    }
    

    if (typeof geofs !== 'undefined') {
        createRainSlider();
        console.log("Rain rework loaded");
    } else {
        console.error("GeoFS not loaded yet!");
    }
    
    let fireworksCollection = null;
    let fireworksParticles = [];
    
    function launchFirework() {
        const viewer = window.geofs?.ceviewer || window.geofs?.api?.viewer;
        if (!viewer || !geofs.aircraft.instance) return;
        
        const lla = geofs.aircraft.instance.llaLocation;
        const heading = geofs.animation.values.heading || 0;
        
        // Spawn 2km (2000m) in front of player
        const headingRad = heading * Math.PI / 180;
        const distance = 2000; // 2km
        const offsetX = Math.sin(headingRad) * distance;
        const offsetY = Math.cos(headingRad) * distance;
        const launchAlt = lla[2] + 300 + Math.random() * 200;
        
        const launchPos = Cesium.Cartesian3.fromDegrees(
            lla[1] + offsetX / 111320,
            lla[0] + offsetY / 110540,
            launchAlt
        );
      
        const colorSchemes = [
            { main: Cesium.Color.GOLD, secondary: Cesium.Color.ORANGE },
            { main: Cesium.Color.WHITE, secondary: Cesium.Color.LIGHTCYAN },
            { main: Cesium.Color.RED, secondary: Cesium.Color.ORANGE },
            { main: Cesium.Color.GREEN, secondary: Cesium.Color.LIME },
            { main: Cesium.Color.BLUE, secondary: Cesium.Color.CYAN },
            { main: Cesium.Color.PURPLE, secondary: Cesium.Color.MAGENTA }
        ];
        const scheme = colorSchemes[Math.floor(Math.random() * colorSchemes.length)];
        
        if (!fireworksCollection) {
            fireworksCollection = new Cesium.PolylineCollection();
            viewer.scene.primitives.add(fireworksCollection);
        }
        
        // Create spherical burst pattern like real fireworks
        const numParticles = 200;
        const explosionParticles = [];
        
        for (let i = 0; i < numParticles; i++) {
            // Spherical distribution
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            
            // Vary speed for depth effect
            const speed = 50 + Math.random() * 40;
            
            const vx = Math.sin(phi) * Math.cos(theta) * speed;
            const vy = Math.sin(phi) * Math.sin(theta) * speed;
            const vz = Math.cos(phi) * speed;
            
            // Mix main and secondary colors
            const color = Math.random() > 0.3 ? scheme.main : scheme.secondary;
            
            const particle = {
                pos: launchPos.clone(),
                startPos: launchPos.clone(),
                vx: vx,
                vy: vy,
                vz: vz,
                life: 5.0,
                maxLife: 5.0,
                color: color,
                polyline: fireworksCollection.add({
                    positions: [launchPos.clone(), launchPos.clone()],
                    width: 4,
                    material: Cesium.Material.fromType('PolylineGlow', {
                        glowPower: 0.3,
                        color: color.withAlpha(1.0)
                    })
                })
            };
            
            explosionParticles.push(particle);
        }
        
        fireworksParticles.push(...explosionParticles);
        
    }
    
    function updateFireworks() {
        if (fireworksParticles.length === 0) return;
        
        const viewer = window.geofs?.ceviewer || window.geofs?.api?.viewer;
        if (!viewer) return;
        
        const dt = 0.05;
        const gravity = -9.8;
        const drag = 0.98;
        const terminalVelocity = -30;
        
        for (let i = fireworksParticles.length - 1; i >= 0; i--) {
            const p = fireworksParticles[i];
            
            p.vx *= drag;
            p.vy *= drag;
            p.vz = p.vz * drag + gravity * dt;
            
            if (p.vz < terminalVelocity) {
                p.vz = terminalVelocity;
            }
            
            const cartographic = Cesium.Cartographic.fromCartesian(p.pos);
            const newPos = Cesium.Cartesian3.fromDegrees(
                cartographic.longitude * (180 / Math.PI) + (p.vx * dt) / 111320,
                cartographic.latitude * (180 / Math.PI) + (p.vy * dt) / 110540,
                cartographic.height + p.vz * dt
            );
            
            p.polyline.positions = [p.startPos, newPos];
            p.pos = newPos;
            
            p.life -= dt;
            
            const fadeRatio = p.life / p.maxLife;
            const alpha = Math.pow(fadeRatio, 0.5); // Slower fade at start
            const brightness = 0.8 + Math.random() * 0.2; // Sparkle
            
            p.polyline.material = Cesium.Material.fromType('PolylineGlow', {
                glowPower: 0.3 * fadeRatio,
                color: p.color.withAlpha(alpha * brightness)
            });
            
            if (p.life <= 0) {
                fireworksCollection.remove(p.polyline);
                fireworksParticles.splice(i, 1);
            }
        }
    }
    
    if (window.geofs?.ceviewer || window.geofs?.api?.viewer) {
        const viewer = window.geofs.ceviewer || window.geofs.api.viewer;
        viewer.scene.preUpdate.addEventListener(updateFireworks);
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === "'") {
            launchFirework();
        }
    });
    
    window.addEventListener('beforeunload', function() {
        stopRain();
        if (fireworksCollection) {
            const viewer = window.geofs?.ceviewer || window.geofs?.api?.viewer;
            if (viewer) viewer.scene.primitives.remove(fireworksCollection);
        }
    });
})();
