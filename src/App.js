import './App.css';
import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import awsconfig from './aws-exports'; // your generated aws-exports file
import { Amplify } from 'aws-amplify';

mapboxgl.accessToken ="pk.eyJ1IjoiaHlmaWRldiIsImEiOiJjbHAwOTY0dDUwNWN4MnFwM3pwcW5heGVkIn0.c_0f7jrsxO_xCPLD9MF2cg"

Amplify.configure(awsconfig);


function App() {
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [map, setMap] = useState(null);
    const [selectedDates, setSelectedDates] = useState(null);
    const [animationIntervalId, setAnimationIntervalId] = useState(null);
    const mapContainerRef = useRef(null);
    const mapInitialized = useRef(false);  // Ref to track if map has been initialized


    const handleSelectDates = () => {
        setSelectedDates({ start: startDate, end: endDate });
    };

    const handleReset = () => {
        setSelectedDates(null);
        if (animationIntervalId) {
            clearInterval(animationIntervalId);
            setAnimationIntervalId(null);
        }
        map.getStyle().layers.forEach(layer => {
            if (layer.id.startsWith('raster-')) {
                map.removeLayer(layer.id);
                map.removeSource(layer.id);
            }
        });
        // Also remove the date and time display if it exists
        const dateTimeDisplay = document.querySelector('.dateTimeDisplay');
        if (dateTimeDisplay) {
            dateTimeDisplay.remove();
        }
    };

    // Function to generate raster URLs
    const generateFileNames = (start, end) => {
        const baseURL = "https://umzdj934ak.execute-api.us-east-2.amazonaws.com/cog/tiles/{z}/{x}/{y}?url=";
        const additionalParams = "&resampling=cubic_spline&nodata=0&colormap=" +
            encodeURIComponent(
                JSON.stringify([
                    [[-100, 0], [173, 216, 230, 0]], // Lightest Blue
                    [[0, 1], [135, 206, 235, 255]],  // Light Blue
                    [[1, 2], [0, 191, 255, 255]],    // Brighter Blue
                    [[2, 3], [0, 127, 255, 255]],    // Medium Blue
                    [[3, 4], [0, 0, 255, 255]],      // Dark Blue
                    [[4, 5], [0, 0, 139, 255]],      // Darker Blue
                    [[5, 100], [25, 25, 112, 255]]   // Darkest Blue
                ])
            );
    
        let startDate = new Date(start);
        const endDate = new Date(end);
        const fileNames = [];
    
        while (startDate <= endDate) {
            const year = startDate.getFullYear();
            const month = String(startDate.getMonth() + 1).padStart(2, '0');
            const day = String(startDate.getDate()).padStart(2, '0');
            const hour = String(startDate.getHours()).padStart(2, '0');
    
            const s3Path = `s3://noaa-raster-bucket-us-east-2/MRMS/${year}/${month}/${day}/MultiSensor_QPE_01H_Pass2_00.00_${year}${month}${day}-${hour}0000.tif`;
            const fullURL = baseURL + encodeURIComponent(s3Path) + additionalParams;
    
            fileNames.push(fullURL);
    
            // Increment by one hour
            startDate.setHours(startDate.getHours() + 1);
        }
    
        return fileNames;
    };

    const handleDownload = async () => {

        try {
            // Generate raster file URLs
            const rasterLinks = generateFileNames(startDate, endDate);

            // Add raster layers to the map
            addRasterLayersToMap(rasterLinks);

            // TODO: Implement GIF generation logic
        } catch (error) {
            console.error('Error overlaying raster on Mapbox:', error);
        }
    };

    // Initialize Mapbox map
    useEffect(() => {
        if (mapContainerRef.current && !mapInitialized.current) {
            const initializedMap = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/light-v11',
                center: [-98.5795, 39.8283],
                zoom: 5
            });
            setMap(initializedMap);
            mapInitialized.current = true;  // Set ref to indicate map has been initialized
        }
    }, []); // Removed `map` from dependency array

    const addRasterLayersToMap = (rasterLinks) => {
        let currentLayerIndex = 0;
        const totalLayers = rasterLinks.length;
        let dateTimeDisplay; // Element to display date and time
    
        const addLayer = (index) => {
            const layerId = 'raster-' + index.toString();
            const rasterLink = rasterLinks[index];
            
            // Extract date and time from the raster link
            const match = rasterLink.match(/MRMS\/(\d{4})\/(\d{2})\/(\d{2})\/MultiSensor_QPE_01H_Pass2_00\.00_(\d{4})(\d{2})(\d{2})-(\d{2})0000\.tif/);
            console.log(match)
            let dateTimeString = "";
            if (match) {
                const [, year, month, day, , , , hour] = match; // Extract relevant parts
                dateTimeString = `${year}-${month}-${day} ${hour}:00:00`;
            }
        
            map.addLayer({
                'id': layerId,
                'type': 'raster',
                'source': {
                    'type': 'raster',
                    'tiles': [rasterLink],
                    'tileSize': 256
                }
            });
        
            // Update date and time display
            if (!dateTimeDisplay) {
                dateTimeDisplay = document.createElement('div');
                map.getContainer().appendChild(dateTimeDisplay);
                dateTimeDisplay.style.position = 'absolute';
                dateTimeDisplay.style.bottom = '10px';
                dateTimeDisplay.style.left = '10px';
                dateTimeDisplay.style.padding = '5px';
                dateTimeDisplay.style.backgroundColor = 'white';
                dateTimeDisplay.style.zIndex = '1';
            }
            dateTimeDisplay.textContent = `Date & Time: ${dateTimeString}`;
        
            return layerId;
        };
    
        const updateLayer = () => {
            // Add the next layer
            if (currentLayerIndex < totalLayers) {
                addLayer(currentLayerIndex);
                currentLayerIndex++;
            } else {
                clearInterval(animationInterval); // Stop the animation
            }
        };
    
        // Clear any existing animation interval
        if (animationIntervalId) {
            clearInterval(animationIntervalId);
        }
    
        // Start the animation
        const animationInterval = setInterval(updateLayer, 1000); // Adjust time as needed
        setAnimationIntervalId(animationInterval);
    };
    
    useEffect(() => {
        if (map && selectedDates) {
            const updateLayers = () => {
                // Add new raster layers
                const rasterLinks = generateFileNames(selectedDates.start, selectedDates.end);
                addRasterLayersToMap(rasterLinks);
            };
    
            if (map.isStyleLoaded()) {
                updateLayers();
            } else {
                map.on('load', updateLayers);
            }
        }
    }, [selectedDates, map]); // Depend on both selectedDates and map
    return (
        <div className="App">
            <h1>Weekly Update GIF Generator</h1>
            <div>
                <DatePicker selected={startDate} onChange={(date) => setStartDate(date)} />
                <DatePicker selected={endDate} onChange={(date) => setEndDate(date)} />
                <button onClick={handleSelectDates}>Select Dates</button>
                <button onClick={handleReset}>Reset</button>
                <button onClick={handleDownload}>Download GIF</button>
            </div>
            <div ref={mapContainerRef} style={{ width: '100%', height: '800px' }}></div>
        </div>
    );
}

export default App;