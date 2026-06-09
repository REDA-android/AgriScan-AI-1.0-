import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Calendar, MapPin, Wind, Cloud, Droplets, Thermometer, ChevronRight, Filter, Search, Plus, RefreshCw, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Observation, WeatherData } from '../types';

interface DashboardProps {
  observations: Observation[];
  weather: WeatherData | null;
  t: any;
  onScan: () => void;
  onViewMap: () => void;
  onViewCatalog: () => void;
  onExport: () => void;
  onRefresh: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  observations, 
  weather, 
  t, 
  onScan, 
  onViewMap, 
  onViewCatalog, 
  onExport, 
  onRefresh 
}) => {
  const stats = React.useMemo(() => {
    const total = observations.length;
    const completed = observations.filter(o => o.status === 'completed').length;
    const analyzing = observations.filter(o => o.status === 'analyzing').length;
    const error = observations.filter(o => o.status === 'error').length;
    
    // Group by culture
    const cultures = observations.reduce((acc: any, o) => {
      acc[o.culture] = (acc[o.culture] || 0) + 1;
      return acc;
    }, {});

    return { total, completed, analyzing, error, cultures };
  }, [observations]);

  const chartData = React.useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    return last7Days.map(date => ({
      date: date.split('-').slice(1).reverse().join('/'),
      count: observations.filter(o => o.capturedAt.startsWith(date)).length
    }));
  }, [observations]);

  return (
    <div className="space-y-6 pb-24">
      {/* Header Section */}
      <div className="flex justify-between items-center px-4 pt-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t.title}</h1>
          <p className="text-xs text-gray-500 font-medium">{t.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onRefresh}
            className="p-2 bg-white rounded-full border shadow-sm hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>
          <button 
            onClick={onExport}
            className="p-2 bg-white rounded-full border shadow-sm hover:bg-gray-50 transition-colors"
          >
            <Download className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-3 px-4">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onScan}
          className="flex flex-col items-center justify-center p-6 bg-green-600 text-white rounded-2xl shadow-lg shadow-green-200"
        >
          <Plus className="w-8 h-8 mb-2" />
          <span className="font-bold text-sm tracking-wide">{t.scan}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onViewMap}
          className="flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200"
        >
          <MapPin className="w-8 h-8 mb-2" />
          <span className="font-bold text-sm tracking-wide">{t.map}</span>
        </motion.button>
      </div>

      {/* Weather Widget */}
      {weather && (
        <div className="mx-4 p-5 bg-white rounded-2xl border shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Cloud className="w-24 h-24 text-blue-500" />
          </div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-blue-500" />
              {t.weather}
            </h2>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase tracking-wider">
              {weather.description}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col items-center">
              <Thermometer className="w-5 h-5 text-orange-500 mb-1" />
              <span className="text-lg font-black text-gray-900">{weather.temp}°</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase">{t.temp}</span>
            </div>
            <div className="flex flex-col items-center border-l">
              <Droplets className="w-5 h-5 text-blue-500 mb-1" />
              <span className="text-lg font-black text-gray-900">{weather.humidity}%</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase">{t.humidity}</span>
            </div>
            <div className="flex flex-col items-center border-l">
              <Wind className="w-5 h-5 text-gray-500 mb-1" />
              <span className="text-lg font-black text-gray-900">{weather.wind}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase">{t.wind}</span>
            </div>
            <div className="flex flex-col items-center border-l">
              <Cloud className="w-5 h-5 text-blue-300 mb-1" />
              <span className="text-lg font-black text-gray-900">{weather.precip}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase">{t.precip}</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats & Chart */}
      <div className="mx-4 p-5 bg-white rounded-2xl border shadow-sm">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          {t.recent}
        </h2>
        <div className="h-40 w-full mb-6 min-w-0 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 600, fill: '#9ca3af' }} 
              />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                labelStyle={{ fontWeight: 'bold' }}
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#16a34a" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#16a34a', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 bg-gray-50 rounded-xl border text-center">
            <span className="block text-xl font-black text-gray-900">{stats.total}</span>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total</span>
          </div>
          <div className="p-3 bg-green-50 rounded-xl border border-green-100 text-center">
            <span className="block text-xl font-black text-green-600">{stats.completed}</span>
            <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">OK</span>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-center">
            <span className="block text-xl font-black text-blue-600">{stats.analyzing}</span>
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">IA</span>
          </div>
        </div>
      </div>

      {/* Recent Observations List Preview */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-gray-900 text-lg">{t.catalog}</h2>
          <button 
            onClick={onViewCatalog}
            className="text-xs font-bold text-green-600 flex items-center gap-1"
          >
            {t.viewCatalog} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          {observations.slice(0, 3).map(obs => (
            <div 
              key={obs.id}
              onClick={() => onViewCatalog()} // Simplified for dashboard preview
              className="flex items-center gap-3 p-3 bg-white rounded-xl border shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <img 
                src={obs.imageUrl} 
                className="w-12 h-12 rounded-lg object-cover bg-gray-100" 
                referrerPolicy="no-referrer"
              />
              <div className="flex-grow min-w-0">
                <h4 className="font-bold text-gray-900 truncate">{obs.variety || obs.culture}</h4>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase">
                  <MapPin className="w-3 h-3" /> {obs.domain}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
