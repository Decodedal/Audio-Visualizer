// PLAYLIST - UPDATE WITH YOUR MP3 FILE PATHS
        const PLAYLIST = [
            { title: "Deteriorate", artist: "LOST DOG", file: "songs/Deteriorate.mp3" },
            { title: "Surfs Up / Radioactive Baby's", artist: "LOST DOG", file: "songs/RadioactiveBabies.mp3" },
            { title: "English", artist: "LOST DOG", file: "songs/English.mp3" },
            { title: "Coagulate", artist: "LOST DOG", file: "songs/Coagulate.mp3" },
            { title: "I've been wasted for too long", artist: "LOST DOG", file: "songs/too-long.mp3" },
            { title: "Piss-Phantom II", artist: "LOST DOG", file: "songs/Piss-Phantom-II.mp3" },
            { title: "2 Bros", artist: "LOST DOG", file: "songs/2Bros.mp3" },
            { title: "French", artist: "LOST DOG", file: "songs/French.mp3" },
            { title: "War", artist: "LOST DOG", file: "songs/War.mp3" },
            { title: "Calico", artist: "LOST DOG", file: "songs/Calico.mp3" },
        
         
        ];

        // Audio context and nodes
        let audioContext;
        let audioSource;
        let gainNode;
        let analyser;
        let dataArray;
        let bufferLength;
        let currentTrack = 0;
        let isPlaying = false;
        let animationId;
        let audioSourceStarted = false; // Track if audio source has been started
        let isLoadingTrack = false; // Track if a track is currently loading

        // Visual settings
        let barColor = "#ff0000";
        let bgColor = "#000000";
        const NUM_BARS = 128; // Number of frequency bars
        let previousData = new Uint8Array(128); // For smoothing
        let timeOffset = 0; // For animation effects
        
        // Dynamic range tracking for better visualization
        let minValue = 0;
        let maxValue = 255;
        let dynamicRange = 255;
        
        // Particle system
        let NUM_PARTICLES = 150;
        let particles = [];
        let particleShape = 'paw';

        // DOM elements
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const playlistEl = document.getElementById('playlist');
        const nowPlayingEl = document.getElementById('nowPlaying');
        const playPauseBtn = document.getElementById('playPauseBtn');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeValue = document.getElementById('volumeValue');
        const barColorInput = document.getElementById('barColor');
        const bgColorInput = document.getElementById('bgColor');
        const particleCountSlider = document.getElementById('particleCountSlider');
        const particleCountValue = document.getElementById('particleCountValue');
        const particleShapeSelect = document.getElementById('particleShape');

        // Initialize canvas
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            // Reinitialize particles if they exist
            if (particles.length > 0) {
                initParticles();
            }
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Initialize audio context
        function initAudioContext() {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        }

        // Create playlist UI (dropdown)
        let isUpdatingPlaylist = false; // Flag to prevent event loops
        function renderPlaylist() {
            isUpdatingPlaylist = true; // Set flag to prevent triggering change event
            playlistEl.innerHTML = '';
            PLAYLIST.forEach((song, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${song.title} - ${song.artist}`;
                if (index === currentTrack) {
                    option.selected = true;
                }
                playlistEl.appendChild(option);
            });
            // Reset flag after a brief delay
            setTimeout(() => { isUpdatingPlaylist = false; }, 100);
        }

        // Update now playing display
        function updateNowPlaying() {
            const song = PLAYLIST[currentTrack];
            nowPlayingEl.innerHTML = `
                <div class="title">${song.title}</div>
                <div class="artist">${song.artist}</div>
            `;
            nowPlayingEl.style.borderColor = barColor;
        }

        // Debug logging function
        function debugLog(message) {
            const debugPanel = document.getElementById('debugPanel');
            const debugLog = document.getElementById('debugLog');
            if (debugPanel && debugLog) {
                debugPanel.style.display = 'block';
                const time = new Date().toLocaleTimeString();
                debugLog.innerHTML += `<div>[${time}] ${message}</div>`;
                debugLog.scrollTop = debugLog.scrollHeight;
            }
            console.log(message);
        }

        // Load and play track
        async function loadTrack(index, shouldPlay = null) {
            // Prevent multiple simultaneous loads
            if (isLoadingTrack) {
                debugLog('[loadTrack] Already loading a track, ignoring request');
                return;
            }
            
            isLoadingTrack = true;
            debugLog('=== [loadTrack] START ===');
            debugLog(`[loadTrack] Called with index: ${index}, Current track: ${currentTrack}, shouldPlay: ${shouldPlay}, isPlaying: ${isPlaying}`);
            
            if (index < 0 || index >= PLAYLIST.length) {
                debugLog('[loadTrack] Invalid index, returning early');
                isLoadingTrack = false;
                return;
            }
            
            // If shouldPlay is provided, use it; otherwise preserve current isPlaying state
            if (shouldPlay !== null) {
                isPlaying = shouldPlay;
                debugLog(`[loadTrack] Setting isPlaying to: ${shouldPlay}`);
            }

            // CRITICAL: Stop and cleanup old audio source FIRST
            debugLog(`[loadTrack] Cleaning up old audio. audioSource exists: ${!!audioSource}, audioSourceStarted: ${audioSourceStarted}`);
            
            // CRITICAL: Properly stop and cleanup ALL audio sources
            if (audioSource) {
                try {
                    debugLog('[loadTrack] Found existing audioSource, stopping...');
                    
                    // CRITICAL: Remove onended handler FIRST to prevent it from firing
                    audioSource.onended = null;
                    debugLog('[loadTrack] Removed onended handler');
                    
                    try {
                        // Stop the source if it was started
                        if (audioSourceStarted) {
                            audioSource.stop(0);
                            debugLog('[loadTrack] Audio source stopped');
                        }
                    } catch (e) {
                        debugLog(`[loadTrack] Stop error (ignored): ${e.message}`);
                    }
                    
                    // Disconnect from all nodes
                    try {
                        audioSource.disconnect();
                        debugLog('[loadTrack] Audio source disconnected');
                    } catch (e) {
                        debugLog(`[loadTrack] Disconnect error (ignored): ${e.message}`);
                    }
                } catch (e) {
                    debugLog(`[loadTrack] Cleanup error: ${e.message}`);
                }
                
                // Clear the reference
                audioSource = null;
                audioSourceStarted = false;
                debugLog('[loadTrack] Audio source reference cleared');
            }
            
            // Disconnect gainNode
            if (gainNode) {
                try {
                    gainNode.disconnect();
                    debugLog('[loadTrack] Gain node disconnected');
                } catch (e) {
                    debugLog(`[loadTrack] Gain node disconnect error: ${e.message}`);
                }
                gainNode = null;
            }

            // Stop animation
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
                debugLog('[loadTrack] Animation cancelled');
            }

            // Wait a bit to ensure cleanup completes
            await new Promise(resolve => setTimeout(resolve, 100));
            debugLog('[loadTrack] Cleanup delay complete');

            currentTrack = index;
            const song = PLAYLIST[index];
            console.log('[loadTrack] Loading song:', song.title, 'File:', song.file);

            try {
                console.log('[loadTrack] Initializing audio context');
                initAudioContext();

                // Resume audio context if suspended
                if (audioContext.state === 'suspended') {
                    console.log('[loadTrack] Resuming suspended audio context');
                    await audioContext.resume();
                }
                console.log('[loadTrack] Audio context state:', audioContext.state);

                // Load audio file
                console.log('[loadTrack] Fetching audio file:', song.file);
                const response = await fetch(song.file);
                console.log('[loadTrack] Fetch response status:', response.status);
                const arrayBuffer = await response.arrayBuffer();
                console.log('[loadTrack] Decoding audio buffer, size:', arrayBuffer.byteLength);
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                console.log('[loadTrack] Audio buffer decoded, duration:', audioBuffer.duration);

                // Create source
                console.log('[loadTrack] Creating audio source');
                audioSource = audioContext.createBufferSource();
                audioSource.buffer = audioBuffer;
                audioSource.loop = false;

                // Create analyser
                console.log('[loadTrack] Creating analyser');
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 16384; // Higher resolution for smoother bars
                analyser.smoothingTimeConstant = 0.5; // Very smooth for lava lamp effect
                bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);
                previousData = new Uint8Array(NUM_BARS);
                timeOffset = 0; // Reset animation offset
                
                // Reset dynamic range tracking for new track
                minValue = 0;
                maxValue = 255;
                dynamicRange = 255;
                
                // Initialize particles
                console.log('[loadTrack] Initializing particles');
                initParticles();

                // Connect nodes
                console.log('[loadTrack] Connecting audio nodes');
                gainNode = audioContext.createGain();
                gainNode.gain.value = volumeSlider.value / 100;
                audioSource.connect(gainNode);
                gainNode.connect(analyser);
                analyser.connect(audioContext.destination);
                console.log('[loadTrack] Audio nodes connected');

                // Handle track end
                audioSource.onended = async () => {
                    debugLog('[onended] Track ended naturally, moving to next');
                    // Only proceed if this is still the current audio source
                    if (audioSource && !audioSourceStarted) {
                        // Source already stopped/cleared, ignore
                        debugLog('[onended] Audio source already cleared, ignoring');
                        return;
                    }
                    // Track ended naturally, move to next and continue playing
                    await nextTrack();
                };

                // Update UI
                updateNowPlaying();
                renderPlaylist();

                // Start visualization
                debugLog(`[loadTrack] isPlaying: ${isPlaying}`);
                if (isPlaying) {
                    debugLog('[loadTrack] Starting audio source NOW');
                    audioSource.start(0);
                    audioSourceStarted = true;
                    animate();
                    debugLog('[loadTrack] Audio started and animation running');
                } else {
                    debugLog('[loadTrack] Not playing - source ready but not started');
                }
                debugLog(`[loadTrack] SUCCESS: ${song.title}`);
                debugLog('=== [loadTrack] END ===');
            } catch (error) {
                debugLog(`[loadTrack] ERROR: ${error.message}`);
                console.error('[loadTrack] ERROR:', error);
                alert(`ERROR LOADING: ${song.title}\n${error.message}\nCheck file path: ${song.file}`);
            } finally {
                // Always reset loading flag
                isLoadingTrack = false;
                debugLog('[loadTrack] Loading flag reset');
            }
        }

        // Play/Pause
        async function togglePlayPause() {
            console.log('[togglePlayPause] Called. audioSource exists:', !!audioSource, 'isPlaying:', isPlaying);
            if (!audioSource) {
                console.log('[togglePlayPause] No audio source, loading track:', currentTrack);
                await loadTrack(currentTrack);
                if (audioSource) {
                    console.log('[togglePlayPause] Starting audio source');
                    audioSource.start(0);
                    audioSourceStarted = true;
                    isPlaying = true;
                    playPauseBtn.textContent = '⏸ PAUSE';
                    animate();
                } else {
                    console.log('[togglePlayPause] Failed to create audio source');
                }
                return;
            }

            if (isPlaying) {
                console.log('[togglePlayPause] Pausing');
                audioContext.suspend();
                isPlaying = false;
                playPauseBtn.textContent = '▶ PLAY';
                if (animationId) {
                    cancelAnimationFrame(animationId);
                }
            } else {
                console.log('[togglePlayPause] Resuming');
                await audioContext.resume();
                isPlaying = true;
                playPauseBtn.textContent = '⏸ PAUSE';
                animate();
            }
        }

        // Next track
        async function nextTrack() {
            if (isLoadingTrack) {
                debugLog('[nextTrack] Already loading, ignoring click');
                return;
            }
            debugLog('[nextTrack] Button clicked');
            const next = (currentTrack + 1) % PLAYLIST.length;
            // Always play when switching tracks
            const shouldPlay = true;
            debugLog(`[nextTrack] Moving from ${currentTrack} to ${next}, shouldPlay: ${shouldPlay}`);
            
            // Disable buttons during load
            nextBtn.disabled = true;
            prevBtn.disabled = true;
            
            try {
                await loadTrack(next, shouldPlay);
                debugLog(`[nextTrack] Complete. isPlaying: ${isPlaying}, audioSourceStarted: ${audioSourceStarted}`);
                playPauseBtn.textContent = '⏸ PAUSE';
            } finally {
                // Re-enable buttons after load completes
                nextBtn.disabled = false;
                prevBtn.disabled = false;
            }
        }

        // Previous track
        async function prevTrack() {
            if (isLoadingTrack) {
                debugLog('[prevTrack] Already loading, ignoring click');
                return;
            }
            debugLog('[prevTrack] Button clicked');
            const prev = (currentTrack - 1 + PLAYLIST.length) % PLAYLIST.length;
            // Always play when switching tracks
            const shouldPlay = true;
            debugLog(`[prevTrack] Moving from ${currentTrack} to ${prev}, shouldPlay: ${shouldPlay}`);
            
            // Disable buttons during load
            nextBtn.disabled = true;
            prevBtn.disabled = true;
            
            try {
                await loadTrack(prev, shouldPlay);
                playPauseBtn.textContent = '⏸ PAUSE';
                debugLog(`[prevTrack] Complete. isPlaying: ${isPlaying}, audioSourceStarted: ${audioSourceStarted}`);
            } finally {
                // Re-enable buttons after load completes
                nextBtn.disabled = false;
                prevBtn.disabled = false;
            }
        }

        // Initialize particle system
        function initParticles() {
            particles = [];
            for (let i = 0; i < NUM_PARTICLES; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    size: Math.random() * 3 + 1,
                    baseSize: Math.random() * 3 + 1,
                    life: Math.random(),
                    speed: Math.random() * 0.02 + 0.01,
                    angle: Math.random() * Math.PI * 2,
                    pulsePhase: Math.random() * Math.PI * 2,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.1
                });
            }
        }

        // Update and draw particles
        function updateParticles() {
            if (!analyser || particles.length === 0) return;
            
            // Get average frequency for global pulse
            let avgFreq = 0;
            for (let i = 0; i < Math.min(20, bufferLength); i++) {
                avgFreq += dataArray[i];
            }
            avgFreq = avgFreq / Math.min(20, bufferLength) / 255;
            
            const baseColor = hexToRgb(barColor);
            
            particles.forEach((particle, index) => {
                // Update position with smooth flow
                particle.x += particle.vx + Math.sin(timeOffset + particle.angle) * 0.3;
                particle.y += particle.vy + Math.cos(timeOffset * 0.7 + particle.angle) * 0.3;
                
                // Wrap around edges
                if (particle.x < 0) particle.x = canvas.width;
                if (particle.x > canvas.width) particle.x = 0;
                if (particle.y < 0) particle.y = canvas.height;
                if (particle.y > canvas.height) particle.y = 0;
                
                // Update rotation
                particle.rotation += particle.rotationSpeed;
                
                // Get frequency at particle's x position for local pulse
                const freqIndex = Math.floor((particle.x / canvas.width) * bufferLength);
                const localFreq = dataArray[freqIndex] / 255;
                
                // Combine global and local frequency for pulsing
                const pulse = (avgFreq * 0.6 + localFreq * 0.4);
                particle.pulsePhase += 0.05;
                
                // Size pulses with music
                const sizePulse = 1 + pulse * 2 + Math.sin(particle.pulsePhase) * 0.3;
                particle.size = particle.baseSize * sizePulse;
                
                // Color intensity based on frequency
                const colorIntensity = Math.min(1, pulse * 1.5);
                const hueShift = (index / NUM_PARTICLES) * 30 + timeOffset * 5;
                
                const r = Math.min(255, Math.max(0, baseColor.r + Math.sin(hueShift * Math.PI / 180) * 30 * colorIntensity));
                const g = Math.min(255, Math.max(0, baseColor.g + Math.cos(hueShift * Math.PI / 180) * 30 * colorIntensity));
                const b = Math.min(255, Math.max(0, baseColor.b + Math.sin((hueShift + 120) * Math.PI / 180) * 30 * colorIntensity));
                
                // Draw particle with glow
                const alpha = 0.3 + colorIntensity * 0.5;
                ctx.fillStyle = `rgba(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)}, ${alpha})`;
                
                // Draw particle shape with rotation
                drawParticleShape(particle.x, particle.y, particle.size, particle.rotation);
                
                // Add glow effect
                ctx.shadowBlur = particle.size * 3;
                ctx.shadowColor = `rgba(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)}, ${alpha * 0.5})`;
                drawParticleShape(particle.x, particle.y, particle.size, particle.rotation);
                ctx.shadowBlur = 0;
            });
        }

        // Draw particle in different shapes
        function drawParticleShape(x, y, size, rotation = 0) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rotation);
            
            ctx.beginPath();
            
            switch(particleShape) {
                case 'paw':
                    // Draw paw print: rounded triangular main pad + 3 toe pads
                    const mainPadRadius = size * 0.75;
                    const toeRadius = size * 0.32;
                    
                    // Main pad - rounded triangle shape using bezier curves
                    ctx.moveTo(0, -mainPadRadius * 1.0);  // Top point
                    
                    // Right side curve
                    ctx.bezierCurveTo(
                        mainPadRadius * 0.7, -mainPadRadius * 0.3,
                        mainPadRadius * 0.95, mainPadRadius * 0.5,
                        mainPadRadius * 0.7, mainPadRadius * 0.8
                    );
                    
                    // Bottom right to bottom left curve
                    ctx.bezierCurveTo(
                        mainPadRadius * 0.3, mainPadRadius * 1.0,
                        -mainPadRadius * 0.3, mainPadRadius * 1.0,
                        -mainPadRadius * 0.7, mainPadRadius * 0.8
                    );
                    
                    // Left side curve
                    ctx.bezierCurveTo(
                        -mainPadRadius * 0.95, mainPadRadius * 0.5,
                        -mainPadRadius * 0.7, -mainPadRadius * 0.3,
                        0, -mainPadRadius * 1.0
                    );
                    
                    ctx.closePath();
                    
                    // Center toe (top)
                    ctx.moveTo(0, -size * 1.5);
                    ctx.arc(0, -size * 1.5, toeRadius, 0, Math.PI * 2);
                    
                    // Left toe
                    ctx.moveTo(-size * 1.1, -size * 0.9);
                    ctx.arc(-size * 1.1, -size * 0.9, toeRadius, 0, Math.PI * 2);
                    
                    // Right toe
                    ctx.moveTo(size * 1.1, -size * 0.9);
                    ctx.arc(size * 1.1, -size * 0.9, toeRadius, 0, Math.PI * 2);
                    break;
                
                case 'circle':
                    ctx.arc(0, 0, size, 0, Math.PI * 2);
                    break;
                    
                case 'square':
                    ctx.rect(-size, -size, size * 2, size * 2);
                    break;
                    
                case 'triangle':
                    ctx.moveTo(0, -size);
                    ctx.lineTo(-size, size);
                    ctx.lineTo(size, size);
                    ctx.closePath();
                    break;
                    
                case 'star':
                    // Draw 5-pointed star
                    const spikes = 5;
                    const outerRadius = size;
                    const innerRadius = size * 0.5;
                    let rot = Math.PI / 2 * 3;
                    const step = Math.PI / spikes;
                    
                    let starX = 0;
                    let starY = -outerRadius;
                    ctx.moveTo(starX, starY);
                    
                    for (let i = 0; i < spikes; i++) {
                        starX = Math.cos(rot) * outerRadius;
                        starY = Math.sin(rot) * outerRadius;
                        ctx.lineTo(starX, starY);
                        rot += step;
                        
                        starX = Math.cos(rot) * innerRadius;
                        starY = Math.sin(rot) * innerRadius;
                        ctx.lineTo(starX, starY);
                        rot += step;
                    }
                    ctx.closePath();
                    break;
            }
            
            ctx.fill();
            ctx.restore();
        }

        // Animation loop - Lava lamp style
        function animate() {
            if (!analyser || !isPlaying) return;

            animationId = requestAnimationFrame(animate);
            timeOffset += 0.015; // Slower, smoother animation

            analyser.getByteFrequencyData(dataArray);

            // Clear canvas
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw particles in background (with lower opacity to keep them behind)
            ctx.save();
            ctx.globalAlpha = 0.4; // Reduce particle opacity so they stay in background
            updateParticles();
            ctx.restore();

            // Calculate dimensions
            const barWidth = canvas.width / NUM_BARS;
            const centerY = window.innerWidth <= 768 ? canvas.height * 0.25 : canvas.height / 2;

            // Find current min/max for dynamic range normalization
            let currentMin = 255;
            let currentMax = 0;
            for (let i = 0; i < bufferLength; i++) {
                if (dataArray[i] < currentMin) currentMin = dataArray[i];
                if (dataArray[i] > currentMax) currentMax = dataArray[i];
            }
            
            // Update dynamic range (smooth tracking)
            minValue = minValue * 0.95 + currentMin * 0.05;
            maxValue = maxValue * 0.95 + currentMax * 0.05;
            dynamicRange = Math.max(1, maxValue - minValue);
            
            // Process frequency data with enhanced dynamics
            const processedData = new Array(NUM_BARS);
            for (let i = 0; i < NUM_BARS; i++) {
                // Logarithmic frequency mapping
                const logIndex = Math.pow(i / NUM_BARS, 2) * bufferLength;
                const dataIndex = Math.floor(logIndex);
                const nextIndex = Math.min(dataIndex + 1, bufferLength - 1);
                const t = logIndex - dataIndex;
                
                // Interpolate between adjacent frequency bins
                let value = dataArray[dataIndex] * (1 - t) + dataArray[nextIndex] * t;
                
                // Dynamic range normalization - stretch the range for more movement
                value = ((value - minValue) / dynamicRange) * 255;
                value = Math.max(0, Math.min(255, value));
                
                // Enhanced sensitivity - amplify differences
                const sensitivity = 2.5; // Boost sensitivity for compressed audio
                value = Math.pow(value / 255, 1 / sensitivity) * 255;
                
                // Reduced smoothing for more responsiveness (70% previous, 30% new)
                const smoothed = previousData[i] * 0.30 + value * 0.30;
                previousData[i] = smoothed;
                
                // Additional contrast boost
                const contrast = 1.8;
                const enhanced = Math.pow(smoothed / 255, 1 / contrast) * 255;
                
                processedData[i] = enhanced;
            }

            // Draw smooth flowing curves using bezier paths
            const points = [];
            for (let i = 0; i < NUM_BARS; i++) {
                const x = i * barWidth + barWidth / 2;
                const value = processedData[i];
                const normalizedValue = value / 255;
                
                // Enhanced dynamic scaling - make it more responsive
                const dynamicScale = 0.7; // Increased from 0.7 for more movement
                
                // Smooth wave motion (reduced to let audio drive more)
                const wave = Math.sin(timeOffset * 0.5 + i * 0.05) * 0.1;
                const flow = Math.cos(timeOffset * 0.3 + i * 0.08) * 0.05;
                
                // Exponential scaling for better visual response to compressed audio
                const exponentialValue = Math.pow(normalizedValue, 0.7);
                const barHeight = (exponentialValue * dynamicScale + wave + flow) * centerY * 0.50;
                
                points.push({
                    x: x,
                    topY: centerY - barHeight,
                    bottomY: centerY + barHeight,
                    value: normalizedValue
                });
            }

            // Draw top flowing curve
            drawSmoothCurve(points, 'top', centerY, true);
            
            // Draw bottom flowing curve
            drawSmoothCurve(points, 'bottom', centerY, false);
        }

        // Draw smooth flowing curves like a lava lamp
        function drawSmoothCurve(points, side, centerY, isTop) {
            if (points.length < 2) return;

            const baseColor = hexToRgb(barColor);
            
            // Create gradient for depth
            const gradient = ctx.createLinearGradient(
                0, isTop ? 0 : centerY,
                0, isTop ? centerY : canvas.height
            );
            
            // Create flowing path using smooth bezier curves
            ctx.beginPath();
            const firstPoint = points[0];
            ctx.moveTo(0, isTop ? firstPoint.topY : firstPoint.bottomY);

            // Use cubic bezier curves for ultra-smooth organic flow
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = i > 0 ? points[i - 1] : points[i];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = i < points.length - 2 ? points[i + 2] : points[i + 1];
                
                const y1 = isTop ? p1.topY : p1.bottomY;
                const y2 = isTop ? p2.topY : p2.bottomY;
                
                // Calculate smooth control points for cubic bezier
                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = y1 + (y2 - (isTop ? p0.topY : p0.bottomY)) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = y2 - ((isTop ? p3.topY : p3.bottomY) - y1) / 6;
                
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, y2);
            }
            
            // Complete the path
            const lastPoint = points[points.length - 1];
            ctx.lineTo(canvas.width, isTop ? lastPoint.topY : lastPoint.bottomY);
            ctx.lineTo(canvas.width, centerY);
            ctx.lineTo(0, centerY);
            ctx.closePath();

            // Fill with gradient and color shifting
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                const hueShift = (i / points.length) * 40 + timeOffset * 8;
                const colorIntensity = point.value;
                
                const r = Math.min(255, Math.max(0, baseColor.r + Math.sin(hueShift * Math.PI / 180) * 40 * colorIntensity));
                const g = Math.min(255, Math.max(0, baseColor.g + Math.cos(hueShift * Math.PI / 180) * 40 * colorIntensity));
                const b = Math.min(255, Math.max(0, baseColor.b + Math.sin((hueShift + 120) * Math.PI / 180) * 40 * colorIntensity));
                
                const stop = i / points.length;
                // Make waveform more opaque to ensure it covers particles
                const opacity = Math.max(0.7, 0.6 + colorIntensity * 0.4);
                gradient.addColorStop(stop, `rgba(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)}, ${opacity})`);
            }
            
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Add soft glow outline
            ctx.strokeStyle = barColor;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.6;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            
            // Add inner glow for depth
            ctx.shadowBlur = 20;
            ctx.shadowColor = barColor;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Helper function to convert hex to RGB
        function hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 0, b: 0 };
        }

        // Color presets
        const presets = {
            red: { bar: "#ff0000", bg: "#000000" },
            green: { bar: "#00ff00", bg: "#000000" },
            pink: { bar: "#ff00ff", bg: "#0000ff" }
        };

        function applyPreset(presetName) {
            const preset = presets[presetName];
            barColor = preset.bar;
            bgColor = preset.bg;
            barColorInput.value = barColor;
            bgColorInput.value = bgColor;
            renderPlaylist();
        }

        // Event listeners
        playPauseBtn.addEventListener('click', togglePlayPause);
        
        // Add debounce to next/prev buttons
        nextBtn.addEventListener('click', () => {
            if (!isLoadingTrack) {
                nextTrack();
            } else {
                debugLog('[nextBtn] Ignoring click - track loading in progress');
            }
        });
        
        prevBtn.addEventListener('click', () => {
            if (!isLoadingTrack) {
                prevTrack();
            } else {
                debugLog('[prevBtn] Ignoring click - track loading in progress');
            }
        });

        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value;
            volumeValue.textContent = volume + '%';
            if (gainNode) {
                gainNode.gain.value = volume / 100;
            }
        });

        barColorInput.addEventListener('input', (e) => {
            barColor = e.target.value;
            updateNowPlaying();
        });

        bgColorInput.addEventListener('input', (e) => {
            bgColor = e.target.value;
        });

        // Playlist dropdown change
        playlistEl.addEventListener('change', (e) => {
            // Ignore if we're programmatically updating the dropdown
            if (isUpdatingPlaylist) {
                debugLog('[playlistEl] Ignoring programmatic update');
                return;
            }
            const selectedIndex = parseInt(e.target.value);
            debugLog(`[playlistEl] User selected track ${selectedIndex}, current: ${currentTrack}, isPlaying: ${isPlaying}`);
            if (selectedIndex !== currentTrack) {
                currentTrack = selectedIndex;
                loadTrack(currentTrack, true); // Always play when user selects a track
                playPauseBtn.textContent = '⏸ PAUSE'
            }
        });

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                applyPreset(preset);
            });
        });

        // Particle controls
        particleCountSlider.addEventListener('input', (e) => {
            NUM_PARTICLES = parseInt(e.target.value);
            particleCountValue.textContent = NUM_PARTICLES;
            initParticles();
        });

        particleShapeSelect.addEventListener('change', (e) => {
            particleShape = e.target.value;
        });

        // Initialize
        renderPlaylist();
        updateNowPlaying();

        // Apply initial preset
        applyPreset('red');
