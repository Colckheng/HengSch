import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { generateGroupId } from '@hengsch/shared-logic';
import type { Group } from '../types';

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

const FALLBACK_GROUP: Group = {
  id: 'default',
  name: '未分类',
  color: '#f4f0e7',
  createdAt: Date.now()
};

export const DEFAULT_GROUP_COLORS = [
  '#ffe770',
  '#cfe5ff',
  '#ffd4c6',
  '#bfead9',
  '#d8caf8',
  '#f8d7e5',
  '#fff1a8',
  '#d9f1ff',
  '#ffdccc',
  '#d8f4ea',
  '#e7dcff',
  '#ffe4f0'
];

const GroupContext = createContext<GroupContextType | undefined>(undefined);

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
  const isLoadedRef = useRef(false);

  const loadGroups = useCallback(async () => {
    try {
      const savedGroups = await window.electronAPI.store.get('groups');
      if (savedGroups && Array.isArray(savedGroups) && savedGroups.length > 0) {
        dispatch({ type: 'SET_GROUPS', payload: savedGroups });
      } else {
        dispatch({ type: 'SET_GROUPS', payload: [FALLBACK_GROUP] });
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
      dispatch({ type: 'SET_GROUPS', payload: [FALLBACK_GROUP] });
    } finally {
      isLoadedRef.current = true;
    }
  }, []);

  const saveGroups = useCallback(async () => {
    try {
      await window.electronAPI.store.set('groups', state.groups);
    } catch (error) {
      console.error('Failed to save groups:', error);
    }
  }, [state.groups]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (isLoadedRef.current) {
      void saveGroups();
    }
  }, [saveGroups]);

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
