import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import './ElevationProfile.css'

export default function ElevationProfile({ 
  gpxContent, 
  trackName = null,
  isOverlay = false,
  routeCoordinates = [], 
  totalDistance = null,
  selectedIndex = null,
  onHover = null
}) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 400, height: 160 })
  const [hoverPosition, setHoverPosition] = useState(null) // {x: number, y: number, elevation: number}
  
  // Store scales for mouse position calculation
  const scalesRef = useRef(null)
  const dataRef = useRef([])

  useEffect(() => {
    if (!gpxContent || !svgRef.current) return

    const data = parseGPXElevation(gpxContent, routeCoordinates, totalDistance)
    
    if (data.length === 0) {
      d3.select(svgRef.current).selectAll('*').remove()
      return
    }

    dataRef.current = data
    renderChart(data, size.width - 30, size.height - 70)
  }, [gpxContent, totalDistance, size])

  const handleDragStart = (e) => {
    if (e.target.closest('.resize-handle') || e.target.closest('.indicator-line')) return
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - containerRef.current.offsetLeft,
      y: e.clientY - containerRef.current.offsetTop
    })
  }

  const handleDrag = (e) => {
    if (!isDragging) return
    const parent = containerRef.current.parentElement
    if (!parent) return
    
    const parentRect = parent.getBoundingClientRect()
    let newX = e.clientX - dragOffset.x
    let newY = e.clientY - dragOffset.y
    
    // Keep within map bounds
    newX = Math.max(0, Math.min(newX, parentRect.width - size.width))
    newY = Math.max(0, Math.min(newY, parentRect.height - size.height))
    
    containerRef.current.style.left = newX + 'px'
    containerRef.current.style.top = newY + 'px'
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  const handleResizeStart = (e) => {
    e.stopPropagation()
    setIsResizing(true)
  }

  const handleResize = (e) => {
    if (!isResizing) return
    const newWidth = Math.max(250, e.clientX - containerRef.current.offsetLeft)
    const newHeight = Math.max(100, e.clientY - containerRef.current.offsetTop)
    setSize({ width: newWidth, height: newHeight })
  }

  const handleResizeEnd = () => {
    setIsResizing(false)
  }

  const handleMouseMove = (e) => {
    if (!scalesRef.current || dataRef.current.length === 0) return
    
    const { xScale, yScale, margin, innerWidth } = scalesRef.current
    const rect = containerRef.current.getBoundingClientRect()
    
    // Get mouse position relative to chart container
    const chartContainer = containerRef.current.querySelector('.chart-container')
    if (!chartContainer) return
    
    const chartRect = chartContainer.getBoundingClientRect()
    const mouseX = e.clientX - chartRect.left - margin.left
    
    // Check if within bounds
    if (mouseX < 0 || mouseX > innerWidth) {
      setHoverPosition(null)
      onHover?.(null)
      return
    }
    
    // Convert to distance
    const distance = xScale.invert(mouseX)
    
    // Find closest data point
    const data = dataRef.current
    let closestPoint = data[0]
    let minDiff = Math.abs(data[0].distance - distance)
    
    for (let i = 1; i < data.length; i++) {
      const diff = Math.abs(data[i].distance - distance)
      if (diff < minDiff) {
        minDiff = diff
        closestPoint = data[i]
      }
    }
    
    const x = xScale(closestPoint.distance)
    const y = yScale(closestPoint.elevation)
    
    setHoverPosition({
      x: x + margin.left,
      y: y + margin.top,
      elevation: closestPoint.elevation,
      distance: closestPoint.distance
    })
    
    const maxDist = data[data.length - 1].distance
    const index = maxDist > 0 ? closestPoint.distance / maxDist : 0
    onHover?.(index)
  }

  const handleMouseLeave = () => {
    setHoverPosition(null)
    onHover?.(null)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag)
      window.addEventListener('mouseup', handleDragEnd)
    }
    return () => {
      window.removeEventListener('mousemove', handleDrag)
      window.removeEventListener('mouseup', handleDragEnd)
    }
  }, [isDragging, dragOffset])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResize)
      window.addEventListener('mouseup', handleResizeEnd)
    }
    return () => {
      window.removeEventListener('mousemove', handleResize)
      window.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [isResizing])

  const parseGPXElevation = (gpxContent, routeCoordinates, totalDistanceKm) => {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(gpxContent, 'text/xml')
    const elevationPoints = []

    const trackPoints = xmlDoc.getElementsByTagName('trkpt')
    
    if (routeCoordinates && routeCoordinates.length > 1 && totalDistanceKm) {
      const numPoints = trackPoints.length
      const totalDist = totalDistanceKm
      
      for (let i = 0; i < numPoints; i++) {
        const ele = trackPoints[i].getElementsByTagName('ele')[0]
        if (ele) {
          const elevation = parseFloat(ele.textContent)
          if (!isNaN(elevation)) {
            const distance = (i / (numPoints - 1)) * totalDist
            elevationPoints.push({ distance, elevation })
          }
        }
      }
    } else {
      let cumulativeDistance = 0
      let prevLat = null, prevLon = null

      for (let i = 0; i < trackPoints.length; i++) {
        const lat = parseFloat(trackPoints[i].getAttribute('lat'))
        const lon = parseFloat(trackPoints[i].getAttribute('lon'))
        const ele = trackPoints[i].getElementsByTagName('ele')[0]

        if (ele) {
          const elevation = parseFloat(ele.textContent)
          if (prevLat !== null && prevLon !== null) {
            cumulativeDistance += calculateDistance(prevLat, prevLon, lat, lon)
          }
          if (!isNaN(elevation)) {
            elevationPoints.push({ distance: cumulativeDistance, elevation })
          }
          prevLat = lat
          prevLon = lon
        }
      }
    }

    return elevationPoints
  }

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  const renderChart = (data, width, height) => {
    if (!svgRef.current || width <= 0 || height <= 0) return
    
    const margin = { top: 25, right: 15, bottom: 25, left: 40 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.distance)])
      .range([0, innerWidth])

    const yScale = d3.scaleLinear()
      .domain([d3.min(data, d => d.elevation) - 10, d3.max(data, d => d.elevation) + 10])
      .range([innerHeight, 0])

    // Store scales for mouse position calculation
    scalesRef.current = { xScale, yScale, margin, innerWidth, innerHeight }

    const area = d3.area()
      .x(d => xScale(d.distance))
      .y0(innerHeight)
      .y1(d => yScale(d.elevation))
      .curve(d3.curveMonotoneX)

    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'elevation-gradient')
      .attr('x1', '0%').attr('x2', '0%')
      .attr('y1', '0%').attr('y2', '100%')

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#4caf50')
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#8bc34a')

    g.append('path').datum(data).attr('fill', 'url(#elevation-gradient)').attr('fill-opacity', 0.6).attr('d', area)

    const line = d3.line().x(d => xScale(d.distance)).y(d => yScale(d.elevation)).curve(d3.curveMonotoneX)
    g.append('path').datum(data).attr('fill', 'none').attr('stroke', '#2e7d32').attr('stroke-width', 2).attr('d', line)

    g.append('g').attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(4).tickFormat(d => `${d.toFixed(1)} km`)).attr('font-size', '9px')
    g.append('g').call(d3.axisLeft(yScale).ticks(4).tickFormat(d => `${d.toFixed(0)}m`)).attr('font-size', '9px')

    const minEle = d3.min(data, d => d.elevation)
    const maxEle = d3.max(data, d => d.elevation)
    const totalDist = d3.max(data, d => d.distance)

    g.append('text').attr('x', innerWidth - 5).attr('y', yScale(maxEle) - 3)
      .attr('text-anchor', 'end').attr('fill', '#2e7d32').attr('font-size', '9px').attr('font-weight', 'bold')
      .text(`↑ ${maxEle.toFixed(0)}m`)
    g.append('text').attr('x', innerWidth - 5).attr('y', yScale(minEle) + 10)
      .attr('text-anchor', 'end').attr('fill', '#666').attr('font-size', '9px')
      .text(`↓ ${minEle.toFixed(0)}m`)
    g.append('text').attr('x', innerWidth / 2).attr('y', -8)
      .attr('text-anchor', 'middle').attr('fill', '#333').attr('font-size', '10px').attr('font-weight', 'bold')
      .text(`${totalDist.toFixed(2)} km`)
  }

  return (
    <div 
      ref={containerRef}
      className="elevation-profile in-container draggable"
      style={{ 
        width: size.width + 'px',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleDragStart}
    >
      <div className="drag-handle">⋮⋮</div>
      <h4>📊 Profilo {trackName ? `- ${trackName}` : ''}</h4>
      <div 
        className="chart-container" 
        style={{ height: size.height - 60 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <svg ref={svgRef}></svg>
        
        {/* Hover indicator - positioned as overlay */}
        {hoverPosition && (
          <div 
            className="hover-indicator"
            style={{ 
              left: hoverPosition.x + 'px',
              top: hoverPosition.y + 'px'
            }}
          >
            <div className="indicator-dot"></div>
            <div className="indicator-tooltip">{hoverPosition.elevation?.toFixed(0)}m</div>
          </div>
        )}
      </div>
      <div className="resize-handle" onMouseDown={handleResizeStart}>↘</div>
    </div>
  )
}