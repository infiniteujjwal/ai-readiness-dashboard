// AIReadinessInteractive.jsx
"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";

import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

import {
  ShieldAlert, CheckCircle, Database, LayoutDashboard, FileText,
  Lock, Users, AlertTriangle, ChevronRight, FileText as FileIcon,
  Clock, ArrowUpDown, Download, ChevronDown, Filter
} from "lucide-react";

/*
  Requirements implemented:
  - Upload CSV and parse locally (custom parser replacing PapaParse)
  - Compute aggregated metrics: unique sites, public sites, everyone/external %, total storage (KB -> MB/GB), top sites by file count
  - Raw per-site table (unique site rows) and full-row expand (show underlying CSV rows for that site)
  - Download exports (CSV and JSON) for filtered sets
  - Sorting and filtering on site table
  - Sharing-level classification (refined heuristics)
  - Staleness calculation by LastModifiedDate
  - All charts update reactively when CSV changes
  
  UPDATES:
  - Added 'gravityMetric' toggle to sort Top Sites by File Count OR Storage Size.
  - Added 'Stale Content' section with expandable list to show individual stale files.
  - Added File Type filtering and visualization.
  - Removed Copilot readiness features.
  - Added 'Risk Profile' global filter based on permission groups.
*/

/* ---------- Utilities ---------- */
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

// Risk Classification Logic
const getRiskProfile = (text) => {
  const t = (text || "").toLowerCase();
  
  // Group 1: The "Kill Switch" Risks (Critical)
  if (/\beveryone\b/.test(t) || t.includes("everyone except external users")) {
    return "Critical";
  }

  // Group 2: The "Blind Spots" (Medium Risk)
  if (
    t.includes("visitor") || // Matches Visitor, Visitors, Project Web App Visitors
    t.includes("excel services viewers") || 
    t.includes("portfolio viewers")
  ) {
    return "Medium";
  }

  // Group 3: The "Safe" Zone (Low Risk)
  if (
    t.includes("owner") ||  // Matches Owner, Owners
    t.includes("member") || // Matches Member, Members
    t.includes("administrator") || 
    t.includes("project manager") || 
    t.includes("team lead") || 
    t.includes("resource manager")
  ) {
    return "Low";
  }

  return "Unknown";
};

// Content Category Logic
const getContentCategory = (ext) => {
  const e = (ext || "").toLowerCase().trim().replace(/^\./, '');
  
  // Group A — High-Value Business Content
  if (["doc", "docx", "pdf", "xlsx", "xls", "ppt", "pptx", "folder"].includes(e)) {
    return "Business";
  }
  
  // Group B — Operational / System Files
  if (["aspx", "odc", "n/a", "unknown", ""].includes(e)) {
    return "System";
  }
  
  // Group C — Media Files
  if (["jpg", "jpeg", "png", "gif", "mp4", "mp3", "wav", "mov"].includes(e)) {
    return "Media";
  }
  
  return "Other";
};

const hrBytes = (kb) => {
  if (!Number.isFinite(kb)) return "0 KB";
  const mb = kb / 1024;
  const gb = mb / 1024;
  if (gb >= 1) return `${Number(gb.toFixed(2))} GB`;
  if (mb >= 1) return `${Number(mb.toFixed(2))} MB`;
  return `${Number(kb.toFixed(2))} KB`;
};

const parseNumber = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9\.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const guessSiteColumn = (headers) => {
  const candidates = headers.filter(h =>
    /site(name|_name)?$|^site$|siteurl|weburl|web url/i.test(h)
  );
  return candidates.length ? candidates[0] : headers[0];
};

const findColumns = (headers, keywords) => {
  const lower = headers.map(h => h.toLowerCase());
  for (const k of keywords) {
    const matchIdx = lower.findIndex(h => h.includes(k.toLowerCase()));
    if (matchIdx >= 0) return headers[matchIdx];
  }
  return null;
};

// Sharing classification: return ranking (higher => more permissive)
const classifySharing = (rowText) => {
  // normalized text
  const t = (rowText || "").toLowerCase();

  if (!t) return { level: "Only Org", rank: 1 };

  // most permissive: anyone / anonymous / public
  if (/\b(anyone|anyonewithlink|anyone with the link|anonymous|public)\b/.test(t)) {
    return { level: "External (Anonymous)", rank: 4 };
  }
  // guests / external / new external
  if (/\b(guest|external|new external|new & existing|new and existing|newexisting)\b/.test(t)) {
    return { level: "External (New & Existing)", rank: 3 };
  }
  // everyone (org-wide)
  if (/\beveryone\b/.test(t)) {
    return { level: "Everyone", rank: 2 };
  }
  return { level: "Only Org", rank: 1 };
};

// Custom CSV Parser to replace papaparse dependency
const parseCSV = (csvText) => {
  const lines = csvText.split(/\r\n|\n/);
  const result = [];
  const headers = [];

  // Helper to split a line by comma, respecting quotes
  const splitLine = (line) => {
    const values = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (char === ',' && !inQuote) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values.map(v => v.replace(/^"|"$/g, ''));
  };

  let headerFound = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!headerFound) {
      headers.push(...splitLine(line));
      headerFound = true;
    } else {
      const values = splitLine(line);
      if (values.length) {
        const row = {};
        headers.forEach((h, index) => {
          row[h] = values[index] || "";
        });
        result.push(row);
      }
    }
  }

  return { data: result, meta: { fields: headers } };
};

/* ---------- Component ---------- */
export default function AIReadinessInteractive({ 
  isEmbedded = false, 
  hideHeader = false, 
  hideFooter = false, 
  compact = false 
}) {
  const [rawCsv, setRawCsv] = useState(null);           
  const [rows, setRows] = useState([]);                 
  const [headers, setHeaders] = useState([]);           
  const [siteKey, setSiteKey] = useState(null);         
  const [fileCountKey, setFileCountKey] = useState(null);
  const [fileSizeKey, setFileSizeKey] = useState(null);
  const [lastModKey, setLastModKey] = useState(null);
  const [fileTypeKey, setFileTypeKey] = useState(null);
  const [fileNameKey, setFileNameKey] = useState(null);
  const [permKey, setPermKey] = useState(null);
  
  const [filter, setFilter] = useState({ search: "", sharing: "all" });
  const [fileTypeFilter, setFileTypeFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stalePeriod, setStalePeriod] = useState("6months"); // Default to 6 months

  const [sort, setSort] = useState({ key: "files", dir: "desc" });
  const [expandedSite, setExpandedSite] = useState(null);
  // New state for toggling stale site details
  const [expandedStaleSite, setExpandedStaleSite] = useState(null); 

  // New state for toggling Data Gravity metric
  const [gravityMetric, setGravityMetric] = useState("files"); // 'files' or 'size'

  // PDF Generation State
  const [pdfLibsLoaded, setPdfLibsLoaded] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Helper to update state with found column keys
  const updateColumnKeys = useCallback((hdrs) => {
    setHeaders(hdrs);
    
    setSiteKey(guessSiteColumn(hdrs));
    setFileCountKey(findColumns(hdrs, ["filecount", "sitefilecount", "itemcount", "documentcount", "count"]));
    setFileSizeKey(findColumns(hdrs, ["filesize", "file_size", "size", "storageusage"]));
    setLastModKey(findColumns(hdrs, ["lastmodified", "modified", "lastmodifieddate"]));
    
    // New keys for file type detection
    setFileTypeKey(findColumns(hdrs, ["extension", "filetype", "file_type", "type", "docicon", "itemtype"]));
    setFileNameKey(findColumns(hdrs, ["filename", "file_name", "name", "itemname", "url", "path", "link"]));
    
    // Permission/Group column detection
    setPermKey(findColumns(hdrs, ["permissions", "perm", "usergroup", "group", "sharedwith", "access", "sharing"]));
  }, []);

  // Helper to calculate stale threshold based on period
  const getStaleThreshold = useCallback((period) => {
    const now = new Date();
    const threshold = new Date(now);
    
    switch(period) {
      case "6months":
        threshold.setMonth(threshold.getMonth() - 6);
        break;
      case "12months":
        threshold.setMonth(threshold.getMonth() - 12);
        break;
      case "2years":
        threshold.setFullYear(threshold.getFullYear() - 2);
        break;
      case "5years":
        threshold.setFullYear(threshold.getFullYear() - 5);
        break;
      default:
        threshold.setMonth(threshold.getMonth() - 6);
    }
    
    return threshold;
  }, []);

  // Helper to get period label
  const getPeriodLabel = (period) => {
    switch(period) {
      case "6months": return "Last 6 Months";
      case "12months": return "Last 12 Months";
      case "2years": return "Last 2 Years";
      case "5years": return "Last 5 Years";
      default: return "Last 6 Months";
    }
  };

  // Helper to extract file extension
  const getFileExtension = useCallback((row) => {
    let val = "";
    if (fileTypeKey && row[fileTypeKey]) {
      val = row[fileTypeKey];
    } else if (fileNameKey && row[fileNameKey]) {
      const name = row[fileNameKey];
      // Handle URLs or paths by taking the last segment
      const lastSegment = name.split('/').pop();
      const parts = lastSegment.split('.');
      if (parts.length > 1) {
        const lastPart = parts.pop();
        val = lastPart.split(/[?#]/)[0]; // Remove query params
      }
    }
    if (!val) return "unknown";
    const clean = String(val).toLowerCase().trim().replace(/^\./, '');
    // Basic validation: extensions are usually short. If > 10 chars, probably not an extension.
    return (clean.length > 0 && clean.length < 10) ? clean : "unknown";
  }, [fileTypeKey, fileNameKey]);

  // PostMessage communication for embedded mode
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Notify parent that dashboard is loaded
    if (isEmbedded) {
      window.parent.postMessage({ type: 'AI_READINESS_LOADED' }, '*');
    }

    // Listen for messages from parent
    const handleMessage = (event) => {
      const data = event.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'LOAD_CSV_DATA':
          if (data.csvText) {
            try {
              const res = parseCSV(data.csvText);
              const parsedData = res.data || [];
              setRows(parsedData);
              const hdrs = res.meta.fields || (parsedData.length ? Object.keys(parsedData[0]) : []);
              
              updateColumnKeys(hdrs);
              
              // Notify parent of successful load
              window.parent.postMessage({ 
                type: 'AI_READINESS_DATA_CHANGE', 
                payload: { rowCount: parsedData.length, headers: hdrs }
              }, '*');
            } catch (err) {
              console.error("CSV parse error from postMessage", err);
            }
          }
          break;
        
        default:
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isEmbedded, updateColumnKeys]);

  // Load PDF libraries from CDN on mount
  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    };

    Promise.all([
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
    ]).then(() => {
      setPdfLibsLoaded(true);
    }).catch(err => console.error("Failed to load PDF libs", err));
  }, []);

  const handleDownloadPdf = async () => {
    if (!pdfLibsLoaded) {
      // In a real app, use a modal/toast, not alert
      console.error("PDF libraries are still loading.");
      return;
    }
    
    setIsGeneratingPdf(true);
    try {
      // Small timeout to allow UI to update (spinner etc)
      await new Promise(r => setTimeout(r, 100));

      const input = document.getElementById('dashboard-container');
      
      // Use window.html2canvas since it was loaded via script tag
      const canvas = await window.html2canvas(input, {
        scale: 2, // higher scale for better quality
        useCORS: true,
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      
      // Access jsPDF from the global window object
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
      
      pdf.save("AI_Readiness_Report.pdf");
    } catch (error) {
      console.error("PDF generation failed", error);
      // In a real app, use a modal/toast, not alert
      console.error("Failed to generate PDF. Check console for details."); 
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // ---------- parse CSV file ----------
  const onFile = useCallback((file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      try {
        const res = parseCSV(text);
        const data = res.data || [];
        setRawCsv(null);
        setRows(data);
        const hdrs = res.meta.fields || (data.length ? Object.keys(data[0]) : []);
        updateColumnKeys(hdrs);
      } catch (err) {
        console.error("CSV parse error", err);
      }
    };
    reader.readAsText(file);
  }, [updateColumnKeys]);

  // ---------- derived rows (filtered by file type & risk profile) ----------
  const filteredRows = useMemo(() => {
    if (!rows || !rows.length) return [];
    
    return rows.filter(r => {
      // 1. File Type Filter
      if (fileTypeFilter !== "All") {
        if (getFileExtension(r) !== fileTypeFilter) return false;
      }
      
      // 2. Risk Profile Filter
      if (riskFilter !== "All") {
        // ALWAYS search the full row for risk keywords to ensure we don't miss 
        // group info that might be in unexpected columns (Description, Name, etc.)
        // This mirrors the robust logic used in site-level classification.
        const textToCheck = Object.values(r).join(" ");
        
        const risk = getRiskProfile(textToCheck);
        
        if (riskFilter === "Critical" && risk !== "Critical") return false;
        if (riskFilter === "Medium" && risk !== "Medium") return false;
        if (riskFilter === "Low" && risk !== "Low") return false;
      }
      
      // 3. Content Category Filter
      if (categoryFilter !== "All") {
        const ext = getFileExtension(r);
        const cat = getContentCategory(ext);
        if (cat !== categoryFilter) return false;
      }

      return true;
    });
  }, [rows, fileTypeFilter, riskFilter, categoryFilter, getFileExtension]);

  // ---------- file type statistics for Pie Chart and Dropdown ----------
  const { fileTypeStats, allFileTypes } = useMemo(() => {
    if (!rows || !rows.length) return { fileTypeStats: [], allFileTypes: [] };
    
    // For the dropdown, we want ALL available types
    const typesSet = new Set();
    // For the chart, we want the distribution of the CURRENT filtered view
    const distribution = {};

    filteredRows.forEach(r => {
      const ext = getFileExtension(r);
      distribution[ext] = (distribution[ext] || 0) + 1;
    });

    rows.forEach(r => {
      const ext = getFileExtension(r);
      typesSet.add(ext);
    });

    const stats = Object.entries(distribution)
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value);
    
    // Group small slices into "Other" if too many
    let chartData = stats.slice(0, 8);
    const others = stats.slice(8).reduce((acc, curr) => acc + curr.value, 0);
    if (others > 0) {
      chartData.push({ name: "Other", value: others });
    }

    const sortedTypes = Array.from(typesSet).sort();
    
    return { fileTypeStats: chartData, allFileTypes: sortedTypes };
  }, [rows, filteredRows, getFileExtension]);

  // ---------- derived site-level aggregation ----------
  const siteAgg = useMemo(() => {
    if (!filteredRows || !filteredRows.length || !siteKey) return { sites: [], maps: {} };

    const map = new Map();
    for (const r of filteredRows) {
      const s = (r[siteKey] || "(unknown)").trim();
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(r);
    }

    const sites = [];
    for (const [siteName, siteRows] of map.entries()) {
      const combinedText = siteRows.map(rr => Object.values(rr).join(" ")).join(" ");
      const sharing = classifySharing(combinedText);

      let files = 0;
      // If a file count column exists, use it. Otherwise, count the rows (assuming each row is a file/item).
      if (fileCountKey) {
        files = siteRows.reduce((acc, r) => acc + parseNumber(r[fileCountKey]), 0);
      } else {
        files = siteRows.length;
      }

      let totalKB = 0;
      if (fileSizeKey) {
        totalKB = siteRows.reduce((acc, r) => acc + parseNumber(r[fileSizeKey]), 0);
      }

      let lastDates = siteRows.map(r => {
        const v = r[lastModKey];
        const d = v ? new Date(v) : null;
        return d && !isNaN(d) ? d : null;
      }).filter(Boolean);
      const lastModified = lastDates.length ? new Date(Math.max(...lastDates.map(d => d.getTime()))) : null;

      const visibleEveryone = /\beveryone\b/i.test(combinedText);
      const visibleExternal = /\b(external|guest|anon|anyone)\b/i.test(combinedText);

      sites.push({
        siteName,
        displayName: siteName,
        files,
        totalKB,
        totalMB: totalKB / 1024,
        totalGB: (totalKB / 1024) / 1024,
        lastModified,
        sharingLevel: sharing.level,
        sharingRank: sharing.rank,
        visibleEveryone,
        visibleExternal,
        rawRows: siteRows
      });
    }

    sites.sort((a,b) => b.files - a.files);
    const maps = { byName: map };
    return { sites, maps };
  }, [filteredRows, siteKey, fileCountKey, fileSizeKey, lastModKey]);

  // ---------- computed summary metrics ----------
  const summary = useMemo(() => {
    const totalSites = siteAgg.sites.length;
    const publicSites = siteAgg.sites.filter(s => s.sharingLevel === "External (Anonymous)" || s.visibleExternal).length;
    const everyoneSites = siteAgg.sites.filter(s => s.visibleEveryone || s.visibleExternal).length;
    const totalKB = siteAgg.sites.reduce((acc,s) => acc + (s.totalKB || 0), 0);
    const totalFiles = siteAgg.sites.reduce((acc,s) => acc + (s.files || 0), 0);
    
    // Calculate stale threshold based on selected period
    const staleThreshold = getStaleThreshold(stalePeriod);
    
    return {
      totalSites,
      publicSites,
      publicPct: totalSites ? Math.round(publicSites / totalSites * 10000)/100 : 0,
      everyoneSites,
      everyonePct: totalSites ? Math.round(everyoneSites / totalSites * 10000)/100 : 0,
      totalKB,
      totalMB: totalKB/1024,
      totalGB: (totalKB/1024)/1024,
      totalFiles,
      staleThreshold // Keep this for use in staleSitesList
    };
  }, [siteAgg, stalePeriod, getStaleThreshold]);

  // ---------- stale sites list (now includes stale files) ----------
  const staleSitesList = useMemo(() => {
    if (!lastModKey) return [];
    const staleThreshold = summary.staleThreshold;

    return siteAgg.sites
      .map(s => {
        // Find the individual rows/files within the site that are stale
        const staleFiles = s.rawRows.filter(r => {
          const v = r[lastModKey];
          const d = v ? new Date(v) : null;
          // Check if date is valid and older than the stale threshold
          return d instanceof Date && !isNaN(d) && d < staleThreshold;
        });

        // Only include the site if it has at least one stale file
        if (staleFiles.length === 0) return null;

        // Calculate the oldest modification date among the stale files for display sorting
        const oldestStaleDate = staleFiles.reduce((minDate, r) => {
            const d = new Date(r[lastModKey]);
            return d < minDate ? d : minDate;
        }, new Date());


        return {
          ...s,
          staleFileCount: staleFiles.length,
          staleKB: staleFiles.reduce((acc, r) => acc + parseNumber(r[fileSizeKey]), 0),
          oldestModified: oldestStaleDate,
          staleFiles: staleFiles
        };
      })
      .filter(Boolean) // Remove sites with no stale files
      .sort((a,b) => a.oldestModified.getTime() - b.oldestModified.getTime()); // oldest site first
  }, [siteAgg.sites, summary.staleThreshold, lastModKey, fileSizeKey]);


  // ---------- top heavy sites (dynamic sort) ----------
  const topHeavy = useMemo(() => {
    let sorted = [...siteAgg.sites];
    if (gravityMetric === 'size') {
      sorted.sort((a, b) => b.totalKB - a.totalKB);
    } else {
      sorted.sort((a, b) => b.files - a.files);
    }
    
    return sorted.slice(0, 10).map(s => ({
      name: s.siteName,
      files: s.files,
      sizeMB: parseFloat(s.totalMB.toFixed(2)),
      displaySize: hrBytes(s.totalKB),
      risk: s.files > 10000 ? "Critical" : (s.files > 1000 ? "High" : (s.files > 500 ? "Medium" : "Low"))
    }));
  }, [siteAgg.sites, gravityMetric]);

  // ---------- filters & sorting for site table (unique sites) ----------
  const filteredSites = useMemo(() => {
    const q = (filter.search || "").toLowerCase().trim();
    let arr = siteAgg.sites.slice();

    if (filter.sharing && filter.sharing !== "all") {
      arr = arr.filter(s => s.sharingLevel === filter.sharing);
    }
    if (q) {
      arr = arr.filter(s => s.siteName.toLowerCase().includes(q));
    }

    arr.sort((a,b) => {
      const k = sort.key;
      const dir = sort.dir === "asc" ? 1 : -1;
      if (k === "name") return dir * a.siteName.localeCompare(b.siteName);
      if (k === "files") return dir * (a.files - b.files);
      if (k === "kb") return dir * (a.totalKB - b.totalKB);
      if (k === "last") {
        const at = a.lastModified ? a.lastModified.getTime() : 0;
        const bt = b.lastModified ? b.lastModified.getTime() : 0;
        return dir * (at - bt);
      }
      return 0;
    });

    return arr;
  }, [siteAgg, filter, sort]);

  // ---------- export helpers ----------
  const downloadJSON = (payload, filename = "export.json") => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = (arr, filename = "export.csv") => {
    if (!arr || !arr.length) return;
    const keys = Object.keys(arr[0]);
    const lines = [keys.join(",")];
    for (const r of arr) {
      const vals = keys.map(k => `"${String(r[k] ?? "").replace(/"/g,'""')}"`);
      lines.push(vals.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen bg-slate-50 ${compact ? 'p-3' : 'p-6'}`} id="dashboard-container">
      {!hideHeader && (
      <header className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className={`${compact ? 'text-xl' : 'text-2xl'} font-bold`}>Interactive Copilot Readiness</h1>
          <p className="text-sm text-slate-500">Upload your SharePoint sites CSV to populate the dashboard</p>
        </div>
        <div className="flex items-center space-x-3 flex-wrap">
          <label className="bg-white px-3 py-2 rounded shadow-sm border cursor-pointer text-sm hover:bg-slate-50 transition-colors">
            Upload CSV
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files[0])} className="hidden" />
          </label>
          
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded shadow-sm text-sm transition-colors"
            onClick={() => {
              const exportArr = filteredSites.map(s => ({
                SiteName: s.siteName,
                Files: s.files,
                TotalKB: s.totalKB,
                TotalMB: s.totalMB.toFixed(2),
                SharingLevel: s.sharingLevel,
                LastModified: s.lastModified ? s.lastModified.toISOString() : ""
              }));
              downloadCSV(exportArr, "filtered_sites.csv");
            }}
          >
            Download CSV
          </button>
          
          <button
            className="bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded text-sm transition-colors"
            onClick={() => {
              const exportJson = siteAgg.sites.map(s => ({
                siteName: s.siteName,
                files: s.files,
                totalKB: s.totalKB,
                sharingLevel: s.sharingLevel
              }));
              downloadJSON(exportJson, "site_summary.json");
            }}
          >
            Download JSON
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={!pdfLibsLoaded || isGeneratingPdf}
            className={`flex items-center px-3 py-2 rounded text-sm shadow-sm transition-colors ${
              !pdfLibsLoaded || isGeneratingPdf 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <Download className="w-4 h-4 mr-2" />
            {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </header>
      )}

      {/* GLOBAL FILTERS */}
      <div className="mb-6 flex items-center gap-4 bg-white p-4 rounded shadow-sm flex-wrap">
        <div className="flex items-center gap-2">
           <Filter className="w-5 h-5 text-slate-500" />
           <span className="font-semibold text-slate-700">Global Filters:</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">File Type:</label>
          <select 
            className="border rounded px-2 py-1 text-sm bg-slate-50 min-w-[150px]"
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
          >
            <option value="All">All Types ({allFileTypes.length})</option>
            {allFileTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 border-l pl-4 ml-2">
          <label className="text-sm text-slate-600">Risk Profile:</label>
          <select 
            className="border rounded px-2 py-1 text-sm bg-slate-50 min-w-[150px]"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="All">All Risks</option>
            <option value="Critical">Kill Switch (Critical)</option>
            <option value="Medium">Blind Spots (Medium)</option>
            <option value="Low">Safe Zone (Low)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 border-l pl-4 ml-2">
          <label className="text-sm text-slate-600">Content:</label>
          <select 
            className="border rounded px-2 py-1 text-sm bg-slate-50 min-w-[150px]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">All Content</option>
            <option value="Business">Business (High Value)</option>
            <option value="System">System (Low Value)</option>
            <option value="Media">Media (Not Relevant)</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {(fileTypeFilter !== "All" || riskFilter !== "All" || categoryFilter !== "All") && (
           <button 
             onClick={() => {
               setFileTypeFilter("All");
               setRiskFilter("All");
               setCategoryFilter("All");
             }}
             className="text-xs text-blue-600 hover:underline"
           >
             Reset Filters
           </button>
        )}
      </div>

      {/* SUMMARY CARDS */}
      <div className="gap-4 mb-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="bg-white p-4 rounded shadow-sm text-center">
          <LayoutDashboard className="mx-auto text-blue-600" />
          <div className="text-2xl font-bold">{summary.totalSites}</div>
          <div className="text-sm text-slate-500">Total Unique Sites</div>
        </div>

        <div className="bg-white p-4 rounded shadow-sm text-center">
          <ShieldAlert className="mx-auto text-red-600" />
          <div className="text-2xl font-bold">{summary.publicSites} ({summary.publicPct}%)</div>
          <div className="text-sm text-slate-500">Sites with Public Access</div>
        </div>

        <div className="bg-white p-4 rounded shadow-sm text-center">
          <Database className="mx-auto text-amber-600" />
          <div className="text-2xl font-bold">{hrBytes(summary.totalMB * 1024)}</div>
          <div className="text-sm text-slate-500">Total Data Volume</div>
        </div>
      </div>

      <div className="gap-6 mb-6" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>
        {/* DATA GRAVITY CHART */}
        <div className="bg-white p-6 rounded shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold flex items-center"><FileIcon className="mr-2" /> Data Gravity (Top Sites)</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => setGravityMetric('files')}
                className={`text-xs px-2 py-1 rounded border ${gravityMetric==='files'?'bg-blue-100 border-blue-300 text-blue-800':'bg-white text-slate-600'}`}
              >
                Sort by Files
              </button>
              <button 
                onClick={() => setGravityMetric('size')}
                className={`text-xs px-2 py-1 rounded border ${gravityMetric==='size'?'bg-blue-100 border-blue-300 text-blue-800':'bg-white text-slate-600'}`}
              >
                Sort by Size
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            Top sites by {gravityMetric === 'files' ? 'file count' : 'storage size'}. Use toggle above to switch view.
          </p>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topHeavy} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={180} style={{fontSize: '11px'}} />
                <Tooltip 
                  formatter={(value, name, props) => {
                    if (gravityMetric === 'size') return [props.payload.displaySize, "Size"];
                    return [value, "Files"];
                  }}
                />
                <Legend />
                <Bar 
                  dataKey={gravityMetric === 'files' ? 'files' : 'sizeMB'} 
                  name={gravityMetric === 'files' ? 'Files' : 'Size (MB)'} 
                  fill="#3b82f6" 
                  radius={[0,4,4,0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FILE TYPE CHART */}
        <div className="bg-white p-6 rounded shadow-sm">
          <h3 className="font-bold mb-3 flex items-center"><FileIcon className="mr-2" /> File Types</h3>
          <p className="text-sm text-slate-500 mb-4">Distribution by type</p>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={fileTypeStats} dataKey="value" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {fileTypeStats.map((entry, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-1 h-[100px] overflow-y-auto pr-1 custom-scrollbar">
            {fileTypeStats.map((p, idx) => (
              <div key={p.name} className="flex justify-between text-xs">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full mr-2" style={{ background: COLORS[idx % COLORS.length] }} />
                  <span className="truncate max-w-[100px]" title={p.name}>{p.name}</span>
                </div>
                <div className="font-semibold">{p.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* STALE SITES SECTION (Updated with Expandable Content) */}
      {staleSitesList.length > 0 && (
        <div className="mb-6 bg-white p-6 rounded shadow-sm border-l-4 border-amber-500">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="font-bold text-lg flex items-center text-slate-800">
              <Clock className="mr-2 text-amber-500" /> Stale Data Analysis ({staleSitesList.length} Sites)
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600">Inactive since:</label>
              <select 
                className="text-xs border rounded px-2 py-1 bg-slate-50 text-slate-700 min-w-[140px]"
                value={stalePeriod}
                onChange={(e) => setStalePeriod(e.target.value)}
              >
                <option value="6months">Last 6 Months</option>
                <option value="12months">Last 12 Months</option>
                <option value="2years">Last 2 Years</option>
                <option value="5years">Last 5 Years</option>
              </select>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            The following sites contain files that have not been modified in the <strong>{getPeriodLabel(stalePeriod).toLowerCase()}</strong>.
            Click to view the specific stale files within each site.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {staleSitesList.map(site => (
              <div key={site.siteName} className="border rounded">
                {/* Collapsible Header */}
                <button 
                  className="w-full text-left p-3 bg-slate-50 flex justify-between items-center hover:bg-slate-100 transition-all"
                  onClick={() => setExpandedStaleSite(expandedStaleSite === site.siteName ? null : site.siteName)}
                >
                  <div className="flex items-center overflow-hidden">
                    {expandedStaleSite === site.siteName ? 
                      <ChevronDown className="w-4 h-4 mr-2 text-amber-600 flex-shrink-0" /> : 
                      <ChevronRight className="w-4 h-4 mr-2 text-amber-600 flex-shrink-0" />
                    }
                    <div className="font-semibold text-sm truncate text-slate-700" title={site.siteName}>{site.siteName}</div>
                  </div>
                  <div className="text-right pl-2 flex-shrink-0">
                    <div className="text-xs font-bold text-slate-600">{site.staleFileCount} Files</div>
                    <div className="text-[10px] text-slate-400">Total: {hrBytes(site.staleKB)}</div>
                  </div>
                </button>

                {/* Expanded Content (Stale Files Table) */}
                {expandedStaleSite === site.siteName && (
                  <div className="p-3 bg-white border-t overflow-x-auto">
                    <h5 className="font-semibold text-xs mb-2 text-slate-600">
                      Individual Stale Files ({site.staleFileCount.toLocaleString()} files)
                    </h5>
                    <table className="w-full text-xs min-w-[600px]">
                      <thead className="bg-slate-50">
                        <tr>
                          {/* Show a subset of useful columns for files */}
                          <th className="p-1 text-left">File Path/URL</th>
                          <th className="p-1 text-left">{lastModKey || 'Last Modified'}</th>
                          <th className="p-1 text-right">{fileSizeKey || 'Size'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {site.staleFiles.slice(0, 50).map((r, i) => ( // Limit to 50 rows for performance
                          <tr key={i} className="hover:bg-amber-50/50 border-t">
                            <td className="p-1 max-w-[250px] truncate" title={r.URL || r.FolderPath || 'N/A'}>{r.URL || r.FolderPath || 'N/A'}</td>
                            <td className="p-1 whitespace-nowrap text-slate-500">{r[lastModKey] || "—"}</td>
                            <td className="p-1 text-right whitespace-nowrap">{hrBytes(parseNumber(r[fileSizeKey]))}</td>
                          </tr>
                        ))}
                        {site.staleFileCount > 50 && (
                          <tr>
                            <td colSpan={3} className="p-1 text-center text-slate-500 text-xs italic">
                              ... and {site.staleFileCount - 50} more stale files. Use the site-level download button in the table above for a full list.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}


      {/* SITE TABLE */}
      <div className="mt-6 bg-white p-4 rounded shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Sites (unique)</h3>
          <div className="flex items-center gap-2">
            <input className="border rounded px-2 py-1 text-sm" placeholder="Search site name..." value={filter.search} onChange={(e)=>setFilter({...filter, search: e.target.value})} />
            <select className="border rounded px-2 py-1 text-sm" value={filter.sharing} onChange={(e)=>setFilter({...filter, sharing: e.target.value})}>
              <option value="all">All Sharing Levels</option>
              <option value="Only Org">Only Org</option>
              <option value="Everyone">Everyone</option>
              <option value="External (New & Existing)">External (New & Existing)</option>
              <option value="External (Anonymous)">External (Anonymous)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-600 bg-slate-50">
              <tr>
                <th className="p-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => setSort({ key: "name", dir: sort.key==='name' && sort.dir==='asc'?'desc':'asc' })}>
                  Site Name {sort.key === 'name' && <ArrowUpDown className="inline w-3 h-3 ml-1" />}
                </th>
                <th className="p-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => setSort({ key: "files", dir: sort.key==='files' && sort.dir==='desc'?'asc':'desc' })}>
                  Files {sort.key === 'files' && <ArrowUpDown className="inline w-3 h-3 ml-1" />}
                </th>
                <th className="p-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => setSort({ key: "kb", dir: sort.key==='kb' && sort.dir==='desc'?'asc':'desc' })}>
                  Storage {sort.key === 'kb' && <ArrowUpDown className="inline w-3 h-3 ml-1" />}
                </th>
                <th className="p-2 text-left">Sharing</th>
                <th className="p-2 text-left cursor-pointer hover:bg-slate-100" onClick={() => setSort({ key: "last", dir: sort.key==='last' && sort.dir==='desc'?'asc':'desc' })}>
                  Last Modified {sort.key === 'last' && <ArrowUpDown className="inline w-3 h-3 ml-1" />}
                </th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.map(s => (
                <tr key={s.siteName} className="hover:bg-slate-50">
                  <td className="p-2">{s.siteName}</td>
                  <td className="p-2">{s.files.toLocaleString()}</td>
                  <td className="p-2">{hrBytes(s.totalKB)}</td>
                  <td className="p-2">{s.sharingLevel}</td>
                  <td className="p-2">{s.lastModified ? s.lastModified.toISOString().split("T")[0] : "—"}</td>
                  <td className="p-2">
                    <button className="px-2 py-1 bg-slate-100 rounded text-xs" onClick={()=>setExpandedSite(expandedSite===s.siteName?null:s.siteName)}>
                      {expandedSite===s.siteName ? "Collapse" : "Expand"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* expanded detail */}
        {expandedSite && (() => {
          const site = siteAgg.sites.find(x => x.siteName === expandedSite);
          if (!site) return null;
          return (
            <div className="mt-4 p-4 bg-slate-50 rounded">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">Details for: {site.siteName}</h4>
                <div>
                  <button className="px-2 py-1 bg-slate-100 rounded text-sm mr-2" onClick={() => downloadJSON(site.rawRows, `${site.siteName}_rows.json`)}>Download Rows (JSON)</button>
                  <button className="px-2 py-1 bg-slate-100 rounded text-sm" onClick={() => downloadCSV(site.rawRows, `${site.siteName}_rows.csv`)}>Download Rows (CSV)</button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white text-slate-600">
                    <tr>
                      {headers.map(h => <th key={h} className="p-2 text-left">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {site.rawRows.map((r, i) => (
                      <tr key={i} className="odd:bg-transparent even:bg-slate-50">
                        {headers.map(h => <td key={h} className="p-2 align-top">{String(r[h] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

      </div>

      {!hideFooter && (
      <footer className="mt-6 text-sm text-slate-500">
        <div>Detected site column: <strong>{siteKey || "(none)"}</strong> &nbsp; | &nbsp; FileCount column: <strong>{fileCountKey || "(none)"}</strong> &nbsp; | &nbsp; FileSize column: <strong>{fileSizeKey || "(none)"}</strong> &nbsp; | &nbsp; LastModified column: <strong>{lastModKey || "(none)"}</strong></div>
        <div className="mt-2">Tip: If the component guessed wrong fields, re-upload a CSV with explicit headers like <em>SiteName,SiteFileCount,FileSize,LastModifiedDate</em>.</div>
      </footer>
      )}
    </div>
  );
}

