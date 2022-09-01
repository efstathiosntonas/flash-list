import React, { useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Dimensions,
  ScrollViewProps,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

import FlashList from "./FlashList";
import { FlashListProps } from "./FlashListProps";
import { PlatformConfig } from "./native/config/PlatformHelper";
import ViewToken from "./viewability/ViewToken";

export interface MasonryFlashListProps<T> {
  data?: FlashListProps<T>["data"];
  numColumns?: FlashListProps<T>["numColumns"];
  estimatedListSize?: FlashListProps<T>["estimatedListSize"];
  estimatedItemSize?: FlashListProps<T>["estimatedItemSize"];
  onEndReached?: FlashListProps<T>["onEndReached"];
  drawDistance?: FlashListProps<T>["drawDistance"];
  renderItem: FlashListProps<T>["renderItem"];
  onEndReachedThreshold?: FlashListProps<T>["onEndReachedThreshold"];
  extraData?: FlashListProps<T>["extraData"];
  onScroll?: FlashListProps<T>["onScroll"];
  contentContainerStyle?: FlashListProps<T>["contentContainerStyle"];
  ListFooterComponent?: FlashListProps<T>["ListFooterComponent"];
  ListHeaderComponent?: FlashListProps<T>["ListHeaderComponent"];
  ListEmptyComponent?: FlashListProps<T>["ListEmptyComponent"];
  ListFooterComponentStyle?: FlashListProps<T>["ListFooterComponentStyle"];
  ListHeaderComponentStyle?: FlashListProps<T>["ListHeaderComponentStyle"];
  viewabilityConfig?: FlashListProps<T>["viewabilityConfig"];
  onViewableItemsChanged?: FlashListProps<T>["onViewableItemsChanged"];
  renderScrollComponent?: FlashListProps<T>["renderScrollComponent"];
  onLoad?: FlashListProps<T>["onLoad"];
  getItemType?: FlashListProps<T>["getItemType"];
  onLayout?: FlashListProps<T>["onLayout"];
  scrollViewProps?: ScrollViewProps;
  refreshing?: FlashListProps<T>["refreshing"];
  onRefresh?: FlashListProps<T>["onRefresh"];
  progressViewOffset?: FlashListProps<T>["progressViewOffset"];
}

type OnScrollCallback = ScrollViewProps["onScroll"];

export interface MasonryFlashListScrollEvent extends NativeScrollEvent {
  doNotPropagate?: boolean;
}

/**
 * MasonryFlashListRef with support for scroll related methods
 */
export interface MasonryFlashListRef<T> {
  scrollToOffset: FlashList<T>["scrollToOffset"];
  scrollToEnd: FlashList<T>["scrollToEnd"];
  getScrollableNode: FlashList<T>["getScrollableNode"];
}

/**
 * FlashList variant that enables rendering of masonry layouts.
 * Please note that the component will not calculate the best fit. The data needs to be in the right order already.
 */
const MasonryFlashListComponent = React.forwardRef(
  <T,>(
    props: MasonryFlashListProps<T>,
    forwardRef: React.ForwardedRef<MasonryFlashListRef<T>>
  ) => {
    const columnCount = props.numColumns || 1;
    const drawDistance =
      props.drawDistance ?? PlatformConfig.defaultMasonryDrawDistance;
    const estimatedListSize = props.estimatedListSize ??
      Dimensions.get("window") ?? { height: 500, width: 500 };

    const dataSet = useDataSet(columnCount, props.data);

    const onScrollRef = useRef<OnScrollCallback[]>([]);
    const emptyScrollEvent = useRef(getBlackScrollEvent())
      .current as NativeSyntheticEvent<MasonryFlashListScrollEvent>;
    const ScrollComponent = useRef(
      getFlashListScrollView(onScrollRef, () => {
        const parentHeight =
          parentFlashList?.current?.recyclerlistview_unsafe?.getRenderedSize()
            .height ?? 0;
        return parentHeight > 0 ? parentHeight : estimatedListSize.height;
      })
    ).current;

    const onScrollProxy = useRef<OnScrollCallback>(
      (scrollEvent: NativeSyntheticEvent<MasonryFlashListScrollEvent>) => {
        emptyScrollEvent.nativeEvent.contentOffset.y =
          scrollEvent.nativeEvent.contentOffset.y -
          (parentFlashList.current?.firstItemOffset ?? 0);
        onScrollRef.current?.forEach((onScrollCallback) => {
          onScrollCallback?.(emptyScrollEvent);
        });
        if (!scrollEvent.nativeEvent.doNotPropagate) {
          props.onScroll?.(scrollEvent);
        }
      }
    ).current;

    const onLoadForNestedLists = useRef(() => {
      setTimeout(() => {
        emptyScrollEvent.nativeEvent.doNotPropagate = true;
        onScrollProxy?.(emptyScrollEvent);
        emptyScrollEvent.nativeEvent.doNotPropagate = false;
      }, 32);
    }).current;

    const [parentFlashList, getFlashList] =
      useRefWithForwardRef<FlashList<T[]>>(forwardRef);

    return (
      <FlashList
        ref={getFlashList}
        {...props.scrollViewProps}
        numColumns={columnCount}
        data={dataSet}
        onScroll={onScrollProxy}
        contentContainerStyle={props.contentContainerStyle}
        ListFooterComponent={props.ListFooterComponent}
        ListHeaderComponent={props.ListHeaderComponent}
        ListEmptyComponent={props.ListEmptyComponent}
        ListFooterComponentStyle={props.ListFooterComponentStyle}
        ListHeaderComponentStyle={props.ListHeaderComponentStyle}
        estimatedItemSize={estimatedListSize.height}
        estimatedListSize={props.estimatedListSize}
        extraData={props.extraData}
        onEndReached={props.onEndReached}
        onEndReachedThreshold={props.onEndReachedThreshold}
        renderScrollComponent={props.renderScrollComponent}
        onLoad={props.onLoad}
        onLayout={props.onLayout}
        refreshing={props.refreshing}
        onRefresh={props.onRefresh}
        progressViewOffset={props.progressViewOffset}
        renderItem={(args) => {
          return (
            <FlashList
              renderScrollComponent={ScrollComponent}
              estimatedItemSize={props.estimatedItemSize}
              data={args.item}
              onLoad={args.index === 0 ? onLoadForNestedLists : undefined}
              renderItem={(innerArgs) => {
                return (
                  props.renderItem?.({
                    ...innerArgs,
                    index: getActualIndex(
                      innerArgs.index,
                      args.index,
                      columnCount
                    ),
                  }) ?? null
                );
              }}
              getItemType={
                props.getItemType
                  ? (item, index, extraData) => {
                      return props.getItemType?.(
                        item,
                        getActualIndex(index, args.index, columnCount),
                        extraData
                      );
                    }
                  : undefined
              }
              drawDistance={drawDistance}
              estimatedListSize={{
                height: estimatedListSize.height,
                width: estimatedListSize.width / columnCount,
              }}
              extraData={props.extraData}
              viewabilityConfig={props.viewabilityConfig}
              onViewableItemsChanged={
                props.onViewableItemsChanged
                  ? (info) => {
                      updateViewToken(
                        info.viewableItems,
                        args.index,
                        columnCount
                      );
                      updateViewToken(info.changed, args.index, columnCount);
                      props.onViewableItemsChanged?.(info);
                    }
                  : undefined
              }
            />
          );
        }}
      />
    );
  }
);

/**
 * Splits data for each column's FlashList
 */
const useDataSet = <T,>(
  columnCount: number,
  sourceData?: FlashListProps<T>["data"]
) => {
  return useMemo(() => {
    const data = sourceData ?? [];
    return data.length > 0
      ? new Array(columnCount).fill(null).map((_, pIndex) => {
          return data?.filter((__, index) => index % columnCount === pIndex);
        })
      : data;
  }, [sourceData, columnCount]) as T[][];
};

/**
 * Handle both function refs and refs with current property
 */
const useRefWithForwardRef = <T,>(
  forwardRef: any
): [React.MutableRefObject<T | null>, (instance: T | null) => void] => {
  const ref: React.MutableRefObject<T | null> = useRef(null);
  return [
    ref,
    useCallback(
      (instance: T | null) => {
        ref.current = instance;
        if (typeof forwardRef === "function") {
          forwardRef(instance);
        } else if (forwardRef) {
          forwardRef.current = instance;
        }
      },
      [forwardRef]
    ),
  ];
};

/**
 * This ScrollView is actually just a view mimicking a scrollview. We block the onScroll event from being passed to the parent list directly.
 * We manually drive onScroll from the parent and thus, achieve recycling.
 */
const getFlashListScrollView = (
  onScrollRef: React.RefObject<OnScrollCallback[]>,
  getParentHeight: () => number
) => {
  const FlashListScrollView = React.forwardRef(
    (props: ScrollViewProps, ref: React.ForwardedRef<View>) => {
      const { onLayout, onScroll, ...rest } = props;
      const onLayoutProxy = useCallback(
        (layoutEvent: LayoutChangeEvent) => {
          onLayout?.({
            nativeEvent: {
              layout: {
                height: getParentHeight(),
                width: layoutEvent.nativeEvent.layout.width,
              },
            },
          } as LayoutChangeEvent);
        },
        [onLayout]
      );
      useEffect(() => {
        if (onScroll) {
          onScrollRef.current?.push(onScroll);
        }
        return () => {
          if (!onScrollRef.current || !onScroll) {
            return;
          }
          const indexToDelete = onScrollRef.current.indexOf(onScroll);
          if (indexToDelete > -1) {
            onScrollRef.current.splice(indexToDelete, 1);
          }
        };
      }, [onScroll]);
      return <View ref={ref} {...rest} onLayout={onLayoutProxy} />;
    }
  );
  FlashListScrollView.displayName = "FlashListScrollView";
  return FlashListScrollView;
};
const updateViewToken = (
  tokens: ViewToken[],
  column: number,
  columnCount: number
) => {
  const length = tokens.length;
  for (let i = 0; i < length; i++) {
    const token = tokens[i];
    if (token.index !== null && token.index !== undefined) {
      token.index = getActualIndex(token.index, column, columnCount);
    }
  }
};
const getActualIndex = (row: number, column: number, columnCount: number) => {
  return row * columnCount + column;
};
const getBlackScrollEvent = () => {
  return {
    nativeEvent: { contentOffset: { y: 0, x: 0 } },
  };
};
MasonryFlashListComponent.displayName = "MasonryFlashList";

/**
 * FlashList variant that enables rendering of masonry layouts.
 * Please note that the component will not calculate the best fit. The data needs to be in the right order already.
 */
export const MasonryFlashList = MasonryFlashListComponent as <T>(
  props: MasonryFlashListProps<T> & {
    ref?: React.RefObject<MasonryFlashListRef<T>>;
  }
) => React.ReactElement;
