import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Shield, CheckCircle2, XCircle, Clock, Search, Filter, ChevronRight, UserPlus, Mail, ShieldCheck, ShieldAlert } from 'lucide-react';
import { UserProfile } from '../types';

interface AdminPanelProps {
  users: UserProfile[];
  onApprove: (uid: string) => void;
  onReject: (uid: string) => void;
  onUpdateRole: (uid: string, role: 'admin' | 'user') => void;
  t: any;
}

const AdminPanel: React.FC<AdminPanelProps> = ({
  users,
  onApprove,
  onReject,
  onUpdateRole,
  t
}) => {
  const [activeTab, setActiveTab] = React.useState<'pending' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'pending' ? user.status === 'pending' : true;
    return matchesSearch && matchesTab;
  });

  const pendingCount = users.filter(u => u.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-[#161c18] border-b px-6 py-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{t.admin}</h1>
            <p className="text-sm text-gray-500 font-medium tracking-wide uppercase">{t.users}</p>
          </div>
          <div className="p-3 bg-blue-500/10 rounded-2xl">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-grow py-2.5 px-4 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === 'pending' 
                ? 'bg-[#161c18] text-blue-400 shadow-none' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.pendingUsers} ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-grow py-2.5 px-4 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === 'all' 
                ? 'bg-[#161c18] text-blue-400 shadow-none' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.allUsers} ({users.length})
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-[#161c18] border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-none"
          />
        </div>
      </div>

      {/* User List */}
      <div className="px-6 space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <motion.div
                key={user.uid}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#161c18] p-5 rounded-2xl border shadow-none space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-black text-xl">
                      {user.displayName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900 leading-tight">{user.displayName}</h3>
                      <p className="text-xs text-gray-400 font-medium flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {user.email}
                      </p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                    user.status === 'approved' ? 'bg-green-50 text-green-600' :
                    user.status === 'rejected' ? 'bg-red-500/100/10 text-red-400' :
                    'bg-orange-50 text-orange-600'
                  }`}>
                    {user.status === 'approved' ? t.accessApproved : 
                     user.status === 'rejected' ? t.accessRejected : t.pending}
                  </div>
                </div>

                <div className="flex items-center gap-4 border-t pt-4">
                  <div className="flex-grow">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t.role}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onUpdateRole(user.uid, 'user')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          user.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        User
                      </button>
                      <button
                        onClick={() => onUpdateRole(user.uid, 'admin')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          user.role === 'admin' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        Admin
                      </button>
                    </div>
                  </div>

                  {user.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onReject(user.uid)}
                        className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors"
                      >
                        <XCircle className="w-6 h-6" />
                      </button>
                      <button
                        onClick={() => onApprove(user.uid)}
                        className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors"
                      >
                        <CheckCircle2 className="w-6 h-6" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 font-bold">{t.noResults}</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminPanel;
