import React, { useState, useMemo } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO,
  isToday
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon
} from 'lucide-react';
import { useData } from '../context/DataContext';

interface CalendarEvent {
  id: string;
  type: 'Task' | 'WorkOrder' | 'Recurring' | 'Due';
  title: string;
  date: Date;
  status?: string;
}

export const DashboardCalendar: React.FC = () => {
  const { 
    tasks = [], 
    workOrders = [], 
    recurringInvoices = [],
    invoices = []
  } = useData();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const events = useMemo(() => {
    const allEvents: CalendarEvent[] = [];

    // Tasks
    tasks.forEach((t: any) => {
      if (t.dueDate) {
        allEvents.push({
          id: t.id,
          type: 'Task',
          title: t.title,
          date: parseISO(t.dueDate),
          status: t.status
        });
      }
    });

    // Work Orders
    workOrders.forEach((w: any) => {
      if (w.dueDate) {
        allEvents.push({
          id: w.id,
          type: 'WorkOrder',
          title: w.productName,
          date: parseISO(w.dueDate),
          status: w.status
        });
      }
    });

    // Recurring Invoices (Subscriptions)
    recurringInvoices.forEach((r: any) => {
      if (r.nextRunDate) {
        allEvents.push({
          id: r.id,
          type: 'Recurring',
          title: r.customerName,
          date: parseISO(r.nextRunDate),
          status: r.status
        });
      }
    });

    // Invoices (Due Dates)
    invoices.forEach((i: any) => {
      if (i.dueDate && i.status !== 'Paid') {
        allEvents.push({
          id: i.id,
          type: 'Due',
          title: `Due: ${i.invoiceNumber || i.id}`,
          date: parseISO(i.dueDate),
          status: i.status
        });
      }
    });

    return allEvents;
  }, [tasks, workOrders, recurringInvoices, invoices]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const getDayEvents = (day: Date) => {
    return events.filter(event => isSameDay(event.date, day));
  };

  const renderIcon = (type: string, isSelected: boolean) => {
    const colorClass = isSelected 
      ? 'bg-white' 
      : (type === 'Task' ? 'bg-amber-500' : 
         type === 'WorkOrder' ? 'bg-blue-500' : 
         type === 'Recurring' ? 'bg-emerald-500' : 
         'bg-rose-500');
    
    return <div className={`w-1.5 h-1.5 rounded-full ${colorClass}`} />;
  };

  return (
    <div className="bg-white rounded-[1.75rem] p-2.5 shadow-card border border-white/50 mb-6">
      <div className="flex items-center justify-between mb-1 px-1">
        <h3 className="text-[12.5px] font-bold text-brand-text uppercase tracking-wider">
          {format(currentMonth, 'MMMM yyyy')}
        </h3>
        <div className="flex gap-0.5">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
            title="Previous month"
            aria-label="Previous month"
          >
            <ChevronLeft size={12} />
          </button>
          <button 
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
            title="Next month"
            aria-label="Next month"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
          <div key={`${day}-${idx}`} className="text-center text-[8px] font-bold text-slate-300 py-0.5">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map((day, idx) => {
          const dayEvents = getDayEvents(day);
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          
          return (
            <div 
              key={idx}
              onClick={() => setSelectedDate(day)}
              className={`
                relative h-[33px] flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all
                ${isSelected ? 'bg-blue-600 text-white shadow-md z-10' : 'hover:bg-slate-50'}
                ${!isCurrentMonth ? 'opacity-20' : ''}
              `}
            >
              <span className={`text-[13px] font-bold ${isToday(day) && !isSelected ? 'text-blue-600' : ''}`}>
                {format(day, 'd')}
              </span>
              
              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5 max-w-full px-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <div key={event.id}>
                    {renderIcon(event.type, isSelected)}
                  </div>
                ))}
              </div>

              {isToday(day) && !isSelected && (
                <div className="absolute bottom-0.5 w-0.5 h-0.5 bg-blue-600 rounded-full" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardCalendar;
