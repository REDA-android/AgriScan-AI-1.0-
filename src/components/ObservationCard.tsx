import React from 'react';
import { motion } from 'motion/react';
import { MapPin, Calendar, ChevronRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Observation } from '../types';

interface ObservationCardProps {
  observation: Observation;
  onClick: () => void;
  t: any;
}

const ObservationCard: React.FC<ObservationCardProps> = ({ observation, onClick, t }) => {
  const getStatusIcon = () => {
    switch (observation.status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'analyzing': return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (observation.status) {
      case 'completed': return 'bg-green-50 border-green-100';
      case 'error': return 'bg-red-500/10 border-red-500/20';
      case 'analyzing': return 'bg-blue-500/10 border-blue-100';
      default: return 'bg-gray-50 border-gray-100';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${getStatusColor()}`}
    >
      <div className="flex gap-4">
        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-200 shadow-inner">
          <img
            src={observation.imageUrl}
            alt={observation.variety}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute bottom-0 right-0 p-1 bg-[#161c18]/80 rounded-tl-lg">
            {getStatusIcon()}
          </div>
        </div>

        <div className="flex flex-col justify-between flex-grow min-w-0">
          <div>
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-gray-900 truncate text-lg leading-tight">
                {observation.variety || observation.culture || t.pending}
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-[#161c18] px-1.5 py-0.5 rounded border">
                {observation.bbchDominant || 'BBCH --'}
              </span>
            </div>
            
            <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{observation.domain}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
              <Calendar className="w-3 h-3" />
              {new Date(observation.capturedAt).toLocaleDateString()}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </div>
        </div>
      </div>
      
      {observation.status === 'analyzing' && (
        <div className="absolute bottom-0 left-0 h-1 bg-blue-500/100 animate-[shimmer_2s_infinite]" style={{ width: '100%' }} />
      )}
    </motion.div>
  );
};

export default ObservationCard;
