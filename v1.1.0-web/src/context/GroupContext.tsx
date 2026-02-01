import React, { createContext, useContext, useReducer, useEffect, useState, ReactNode } from 'react';
import type { Group } from '@hengsch/shared-types';
import { generateGroupId } from '@hengsch/shared-logic';
import { storage } from '../utils/localStorageAdapter';

interface GroupState {
  groups: Group[];
}

type GroupAction =
  | { type: 'SET_GROUPS'; payload: Group[] }
  | { type: 'ADD_GROUP'; payload: Group }
  | { type: 'UPDATE_GROUP'; payload: { id: string; updates: Partial<Group> } }
  | { type: 'DELETE_GROUP'; payload: string };

interface GroupContextType {
  state: GroupState;
  dispatch: React.Dispatch<GroupAction>;
  addGroup: (group: Omit<Group, 'id' | 'createdAt'>) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  getGroupById: (id: string) => Group | undefined;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

const DEFAULT_GROUP_COLORS = [
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
    case 'DELETE_GROUP':
      return {
        ...state,
        groups: state.groups.filter((group) => group.id !== action.payload)
      };
    default:
      return state;
  }
}

export function GroupProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(groupReducer, { groups: [] });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    loadGroups().then(() => setIsInitialized(true));
  }, []);

  useEffect(() => {
    if (isInitialized) saveGroups();
  }, [state.groups, isInitialized]);

  const loadGroups = async () => {
    try {
      const savedGroups = await storage.get<Group[]>('groups');
      if (savedGroups && Array.isArray(savedGroups)) {
        dispatch({ type: 'SET_GROUPS', payload: savedGroups });
      } else {
        const defaultGroup: Group = {
          id: 'default',
          name: '未分类',
          color: '#F5F5F5',
          createdAt: Date.now()
        };
        dispatch({ type: 'SET_GROUPS', payload: [defaultGroup] });
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
      const defaultGroup: Group = {
        id: 'default',
        name: '未分类',
        color: '#F5F5F5',
        createdAt: Date.now()
      };
      dispatch({ type: 'SET_GROUPS', payload: [defaultGroup] });
    }
  };

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
      createdAt: Date.now()
    };
    dispatch({ type: 'ADD_GROUP', payload: newGroup });
  };

  const updateGroup = (id: string, updates: Partial<Group>) => {
    dispatch({ type: 'UPDATE_GROUP', payload: { id, updates } });
  };

  const deleteGroup = (id: string) => {
    if (id === 'default') {
      console.warn('Cannot delete default group');
      return;
    }
    dispatch({ type: 'DELETE_GROUP', payload: id });
  };

  const getGroupById = (id: string): Group | undefined => {
    return state.groups.find((group) => group.id === id);
  };

  return (
    <GroupContext.Provider
      value={{
        state,
        dispatch,
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

export { DEFAULT_GROUP_COLORS };
