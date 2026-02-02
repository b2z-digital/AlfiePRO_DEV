import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, MoreHorizontal, Search, Filter } from 'lucide-react';
import { EventTaskBoard, TaskGroup, BoardColumn, EnhancedTask, TaskColumnData } from '../../types/eventCommandCenter';
import { AddColumnTypeModal } from './AddColumnTypeModal';
import { AddGroupModal } from './AddGroupModal';
import { TableBoardRow } from './TableBoardRow';
import { TableBoardHeader } from './TableBoardHeader';
import { EventCommandCenterStorage } from '../../utils/eventCommandCenterStorage';
import { useNotifications } from '../../contexts/NotificationContext';

interface TableBoardProps {
  board: EventTaskBoard;
  event_id: string;
  darkMode: boolean;
}

export const TableBoard: React.FC<TableBoardProps> = ({ board, event_id, darkMode }) => {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [tasks, setTasks] = useState<EnhancedTask[]>([]);
  const [columnData, setColumnData] = useState<Map<string, Map<string, TaskColumnData>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadBoardData();
  }, [board.id]);

  const loadBoardData = async () => {
    try {
      setLoading(true);
      const [groupsData, columnsData, tasksData, columnDataArray] = await Promise.all([
        EventCommandCenterStorage.getGroups(board.id),
        EventCommandCenterStorage.getColumns(board.id),
        EventCommandCenterStorage.getBoardTasks(board.id),
        EventCommandCenterStorage.getAllColumnData(board.id),
      ]);

      setGroups(groupsData);
      setColumns(columnsData);
      setTasks(tasksData);

      // Organize column data by task_id -> column_id
      const dataMap = new Map<string, Map<string, TaskColumnData>>();
      columnDataArray.forEach((data) => {
        if (!dataMap.has(data.task_id)) {
          dataMap.set(data.task_id, new Map());
        }
        dataMap.get(data.task_id)!.set(data.column_id, data);
      });
      setColumnData(dataMap);
    } catch (error) {
      console.error('Error loading board data:', error);
      addNotification('Failed to load board', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = async (name: string, color: string) => {
    try {
      const newGroup = await EventCommandCenterStorage.createGroup({
        board_id: board.id,
        name,
        color,
        position: groups.length,
      });
      setGroups([...groups, newGroup]);
      addNotification('Group added', 'success');
    } catch (error) {
      console.error('Error adding group:', error);
      addNotification('Failed to add group', 'error');
    }
  };

  const handleAddColumn = async (name: string, columnType: string, settings: any) => {
    try {
      const newColumn = await EventCommandCenterStorage.createColumn({
        board_id: board.id,
        name,
        column_type: columnType as any,
        position: columns.length,
        width: 150,
        settings,
      });
      setColumns([...columns, newColumn]);
      addNotification('Column added', 'success');
    } catch (error) {
      console.error('Error adding column:', error);
      addNotification('Failed to add column', 'error');
    }
  };

  const handleAddTask = async (groupId: string) => {
    try {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const tasksInGroup = tasks.filter((t) => t.group_id === groupId);
      const newTask = await EventCommandCenterStorage.createTask({
        title: 'New task',
        board_id: board.id,
        group_id: groupId,
        position_in_group: tasksInGroup.length,
        event_id,
        club_id: board.club_id,
        state_association_id: board.state_association_id,
        national_association_id: board.national_association_id,
        priority: 'medium',
        status: 'pending',
      });

      setTasks([...tasks, newTask]);
      addNotification('Task added', 'success');
    } catch (error) {
      console.error('Error adding task:', error);
      addNotification('Failed to add task', 'error');
    }
  };

  const handleUpdateColumnData = async (taskId: string, columnId: string, value: any) => {
    try {
      const existingData = columnData.get(taskId)?.get(columnId);

      if (existingData) {
        await EventCommandCenterStorage.updateColumnData(existingData.id, value);
      } else {
        const newData = await EventCommandCenterStorage.createColumnData({
          task_id: taskId,
          column_id: columnId,
          value,
        });

        const updatedMap = new Map(columnData);
        if (!updatedMap.has(taskId)) {
          updatedMap.set(taskId, new Map());
        }
        updatedMap.get(taskId)!.set(columnId, newData);
        setColumnData(updatedMap);
      }
    } catch (error) {
      console.error('Error updating column data:', error);
      addNotification('Failed to update', 'error');
    }
  };

  const toggleGroupCollapse = async (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    try {
      await EventCommandCenterStorage.updateGroup(groupId, {
        is_collapsed: !group.is_collapsed,
      });

      setGroups(groups.map((g) => (g.id === groupId ? { ...g, is_collapsed: !g.is_collapsed } : g)));
    } catch (error) {
      console.error('Error toggling group:', error);
    }
  };

  const getTasksForGroup = (groupId: string) => {
    return tasks
      .filter((t) => t.group_id === groupId)
      .filter((t) => {
        if (!searchTerm) return true;
        return t.title.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => (a.position_in_group || 0) - (b.position_in_group || 0));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  // Auto-show modals if empty
  if (groups.length === 0 && !showAddGroupModal) {
    setTimeout(() => setShowAddGroupModal(true), 100);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddGroupModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Group
          </button>

          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tasks..."
              className={`
                pl-10 pr-4 py-2 rounded-lg border text-sm w-64
                ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
              ${darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}
            `}
          >
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-full">
          {/* Table Header */}
          <TableBoardHeader
            columns={columns}
            darkMode={darkMode}
            onAddColumn={() => setShowAddColumnModal(true)}
          />

          {/* Groups and Tasks */}
          {groups.map((group) => {
            const groupTasks = getTasksForGroup(group.id);

            return (
              <div key={group.id} className="border-b border-gray-200 dark:border-gray-700">
                {/* Group Header */}
                <div
                  className={`
                    flex items-center gap-2 px-4 py-3 cursor-pointer sticky left-0 z-10
                    ${darkMode ? 'bg-gray-800/95 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'}
                  `}
                  style={{ borderLeft: `4px solid ${group.color}` }}
                  onClick={() => toggleGroupCollapse(group.id)}
                >
                  {group.is_collapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {group.name}
                  </span>
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    ({groupTasks.length})
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddTask(group.id);
                    }}
                    className={`
                      ml-auto p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600
                      ${darkMode ? 'text-gray-400' : 'text-gray-600'}
                    `}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Tasks */}
                {!group.is_collapsed && groupTasks.map((task) => (
                  <TableBoardRow
                    key={task.id}
                    task={task}
                    columns={columns}
                    columnData={columnData.get(task.id) || new Map()}
                    darkMode={darkMode}
                    onUpdateColumnData={handleUpdateColumnData}
                  />
                ))}

                {/* Add Task Row */}
                {!group.is_collapsed && (
                  <button
                    onClick={() => handleAddTask(group.id)}
                    className={`
                      w-full text-left px-4 py-2 text-sm
                      ${darkMode ? 'text-gray-500 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-50'}
                    `}
                  >
                    + Add task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      <AddGroupModal
        isOpen={showAddGroupModal}
        onClose={() => setShowAddGroupModal(false)}
        onSubmit={handleAddGroup}
        darkMode={darkMode}
      />

      <AddColumnTypeModal
        isOpen={showAddColumnModal}
        onClose={() => setShowAddColumnModal(false)}
        onSubmit={handleAddColumn}
        darkMode={darkMode}
      />
    </div>
  );
};
