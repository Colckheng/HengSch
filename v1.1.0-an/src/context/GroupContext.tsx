import React, { createContext, useContext, useReducer, useEffect, useState, useRef, ReactNode } from 'react';
import type { Group } from '@hengsch/shared-types';
import { generateGroupId, normalizeSynced } from '@hengsch/shared-logic';
import { storage } from '../utils/asyncStorageAdapter';
import { getDeviceId } from '../utils/device';

interface GroupState {
  /** 原始数组（含墓碑），负责持久化与同步 */
  groups: Group[];
}

type GroupAction =
  | { type: 'SET_GROUPS'; payload: Group[] }
  | { type: 'ADD_GROUP'; payload: Group }
  | { type: 'UPDATE_GROUP'; payload: { id: string; updates: Partial<Group> } }
  | { type: 'DELETE_GROUP'; payload: { id: string; updatedAt: number; deviceId: string } };

interface GroupContextType {
  /** 可见分组（已过滤墓碑），展示用 */
  state: GroupState;
  /** 原始分组（含墓碑），持久化/同步用 */
  allGroups: Group[];
  /** 初始加载完成（同步首拍需等待，避免被启动加载覆盖） */
  isInitialized: boolean;
  /** 同步合并结果整体应用（全量覆盖原始数组） */
  applySyncedGroups: (groups: Group[]) => void;
  addGroup: (group: Omit<Group, 'id' | 'createdAt'>) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  getGroupById: (id: string) => Group | undefined;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export const DEFAULT_GROUP_COLORS = [
  '#E3F2FD',
  '#E8F5E9',
  '#FFF3E0',
  '#F3E5F5',
  '#E0F2F1',
  '#FFF9C4',
  '#FCE4EC',
  '#E8EAF6',
  '#E0F7FA',
  '#F5F5F5',
  '#FFF8E1',
  '#FBE9E7'
];

const isVisible = (group: Group): boolean => !group.deleted;

function groupReducer(state: GroupState, action: GroupAction): GroupState {
  switch (action.type) {
    case 'SET_GROUPS':
      return { ...state, groups: action.payload };
    case 'ADD_GROUP':
      return { ...state, groups: [...state.groups, action.payload] };
    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.id === action.payload.id ? { ...group, ...action.payload.updates } : group
        )
      };
    case 'DELETE_GROUP': {
      const { id, updatedAt, deviceId } = action.payload;
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.id === id && !group.deleted ? { ...group, deleted: true, updatedAt, deviceId } : group
        )
      };
    }
    default:
      return state;
  }
}

export function GroupProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [state, dispatch] = useReducer(groupReducer, { groups: [] });
  const [isInitialized, setIsInitialized] = useState(false);
  const deviceIdRef = useRef<string>('legacy');

  useEffect(() => {
    (async () => {
      try {
        deviceIdRef.current = await getDeviceId();
      } catch (error) {
        console.error('Failed to get deviceId:', error);
      }
      await loadGroups();
      setIsInitialized(true);
    })();
  }, []);

  useEffect(() => {
    if (isInitialized) saveGroups();
  }, [state.groups, isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps -- saveGroups 每次渲染重建，加入会导致重复写盘

  const loadGroups = async () => {
    try {
      const savedGroups = await storage.get<Group[]>('groups');
      if (savedGroups && Array.isArray(savedGroups)) {
        dispatch({ type: 'SET_GROUPS', payload: savedGroups.map(normalizeSynced) });
      } else {
        dispatch({ type: 'SET_GROUPS', payload: [createDefaultGroup()] });
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
      dispatch({ type: 'SET_GROUPS', payload: [createDefaultGroup()] });
    }
  };

  const createDefaultGroup = (): Group =>
    normalizeSynced({
      id: 'default',
      name: '未分类',
      color: '#F5F5F5',
      createdAt: Date.now(),
      deviceId: deviceIdRef.current
    });

  const saveGroups = async () => {
    try {
      await storage.set('groups', state.groups);
    } catch (error) {
      console.error('Failed to save groups:', error);
    }
  };

  const addGroup = (groupData: Omit<Group, 'id' | 'createdAt'>) => {
    const newGroup: Group = {
      ...groupData,
      id: generateGroupId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: deviceIdRef.current
    };
    dispatch({ type: 'ADD_GROUP', payload: newGroup });
  };

  const updateGroup = (id: string, updates: Partial<Group>) => {
    dispatch({
      type: 'UPDATE_GROUP',
      payload: {
        id,
        updates: { ...updates, updatedAt: Date.now(), deviceId: deviceIdRef.current }
      }
    });
  };

  const deleteGroup = (id: string) => {
    if (id === 'default') return;
    dispatch({
      type: 'DELETE_GROUP',
      payload: { id, updatedAt: Date.now(), deviceId: deviceIdRef.current }
    });
  };

  const getGroupById = (id: string): Group | undefined => {
    return state.groups.find((group) => group.id === id && isVisible(group));
  };

  const visibleGroups = state.groups.filter(isVisible);

  const applySyncedGroups = (groups: Group[]) => {
    dispatch({ type: 'SET_GROUPS', payload: groups });
  };

  return (
    <GroupContext.Provider
      value={{
        state: { groups: visibleGroups },
        allGroups: state.groups,
        isInitialized,
        applySyncedGroups,
        addGroup,
        updateGroup,
        deleteGroup,
        getGroupById
      }}
    >
      {children}
    </GroupContext.Provider>
  );
}

export function useGroups(): GroupContextType {
  const context = useContext(GroupContext);
  if (context === undefined) {
    throw new Error('useGroups must be used within a GroupProvider');
  }
  return context;
}
