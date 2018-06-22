import React from 'react';
import PropTypes from 'prop-types';
import { View, Text, ScrollView } from 'react-native';
import { connect } from 'react-redux';
import moment from 'moment';
import { Navigation } from 'react-native-navigation';

import LoggedView from '../View';
import Status from '../../containers/status';
import Avatar from '../../containers/Avatar';
import styles from './styles';
import sharedStyles from '../Styles';
import database from '../../lib/realm';
import RocketChat from '../../lib/rocketchat';

import log from '../../utils/log';
import RoomTypeIcon from '../../containers/RoomTypeIcon';
import I18n from '../../i18n';

const PERMISSION_EDIT_ROOM = 'edit-room';

const camelize = str => str.replace(/^(.)/, (match, chr) => chr.toUpperCase());
const getRoomTitle = room => (room.t === 'd' ?
	<Text testID='room-info-view-name' style={styles.roomTitle}>{room.fname}</Text> :
	[
		<RoomTypeIcon type={room.t} key='room-info-type' />,
		<Text testID='room-info-view-name' style={styles.roomTitle} key='room-info-name'>{room.name}</Text>
	]
);

/** @extends React.Component */
class RoomInfoView extends LoggedView {
	static propTypes = {
		componentId: PropTypes.any,
		rid: PropTypes.string,
		user: PropTypes.object,
		activeUsers: PropTypes.object,
		Message_TimeFormat: PropTypes.string,
		roles: PropTypes.object
	}

	// eslint-disable-next-line react/sort-comp
	static get options() {
		return {
			topBar: {
				title: {
					text: 'Info'
				}
			}
		};
	}

	constructor(props) {
		super('RoomInfoView', props);
		const { rid } = props;
		this.rooms = database.objects('subscriptions').filtered('rid = $0', rid);
		this.sub = {
			unsubscribe: () => {}
		};
		this.state = {
			room: {},
			roomUser: {},
			roles: []
		};
	}

	async componentDidMount() {
		await this.updateRoom();
		this.rooms.addListener(this.updateRoom);

		// get user of room
		if (this.state.room.t === 'd') {
			try {
				const roomUser = await RocketChat.getRoomMember(this.state.room.rid, this.props.user.id);
				this.setState({ roomUser });
				const username = this.state.room.name;

				const activeUser = this.props.activeUsers[roomUser._id];
				if (!activeUser || !activeUser.utcOffset) {
					// get full user data looking for utcOffset
					// will be catched by .on('users) and saved on activeUsers reducer
					this.getFullUserData(username);
				}

				// get all users roles
				// needs to be changed by a better method
				const allUsersRoles = await RocketChat.getUserRoles();
				const userRoles = allUsersRoles.find(user => user.username === username);
				if (userRoles) {
					this.setState({ roles: userRoles.roles || [] });
				}
			} catch (e) {
				log('RoomInfoView.componentDidMount', e);
			}
		} else {
			// TODO: permission!
			const permissions = RocketChat.hasPermission([PERMISSION_EDIT_ROOM], this.state.room.rid);
			if (permissions[PERMISSION_EDIT_ROOM]) {
				Navigation.mergeOptions(this.props.componentId, {
					topBar: {
						rightButtons: [{
							id: 'RoomInfoView.edit',
							title: 'Edit',
							testID: 'room-info-view-edit-button',
							icon: require('../../static/images/navicon_add.png') // eslint-disable-line
						}]
					}
				});
			}
		}
	}

	componentWillUnmount() {
		this.rooms.removeAllListeners();
		this.sub.unsubscribe();
	}

	onNavigationButtonPressed = () => {
		Navigation.push(this.props.componentId, {
			component: {
				name: 'RoomInfoEditView',
				passProps: {
					rid: this.props.rid
				}
			}
		});
	}

	getFullUserData = async(username) => {
		try {
			const result = await RocketChat.subscribe('fullUserData', username);
			this.sub = result;
		} catch (e) {
			log('getFullUserData', e);
		}
	}

	isDirect = () => this.state.room.t === 'd';

	updateRoom = async() => {
		const [room] = this.rooms;
		this.setState({ room });
	}

	renderItem = (key, room) => (
		<View style={styles.item}>
			<Text style={styles.itemLabel}>{I18n.t(camelize(key))}</Text>
			<Text
				style={[styles.itemContent, !room[key] && styles.itemContent__empty]}
				testID={`room-info-view-${ key }`}
			>{ room[key] ? room[key] : I18n.t(`No_${ key }_provided`) }
			</Text>
		</View>
	);

	renderRoles = () => (
		this.state.roles.length > 0 ?
			<View style={styles.item}>
				<Text style={styles.itemLabel}>{I18n.t('Roles')}</Text>
				<View style={styles.rolesContainer}>
					{this.state.roles.map(role => (
						<View style={styles.roleBadge} key={role}>
							<Text>{ this.props.roles[role] }</Text>
						</View>
					))}
				</View>
			</View>
			: null
	)

	renderTimezone = (userId) => {
		if (this.props.activeUsers[userId]) {
			const { utcOffset } = this.props.activeUsers[userId];

			if (!utcOffset) {
				return null;
			}
			// TODO: translate
			return (
				<View style={styles.item}>
					<Text style={styles.itemLabel}>{I18n.t('Timezone')}</Text>
					<Text style={styles.itemContent}>{moment().utcOffset(utcOffset).format(this.props.Message_TimeFormat)} (UTC { utcOffset })</Text>
				</View>
			);
		}
		return null;
	}

	renderAvatar = (room, roomUser) => (
		<Avatar
			text={room.name}
			size={100}
			style={styles.avatar}
			type={room.t}
		>
			{room.t === 'd' ? <Status style={[sharedStyles.status, styles.status]} id={roomUser._id} /> : null}
		</Avatar>
	)

	renderBroadcast = () => (
		<View style={styles.item}>
			<Text style={styles.itemLabel}>{I18n.t('Broadcast_Channel')}</Text>
			<Text
				style={styles.itemContent}
				testID='room-info-view-broadcast'
			>{I18n.t('Broadcast_channel_Description')}
			</Text>
		</View>
	)

	render() {
		const { room, roomUser } = this.state;
		if (!room) {
			return <View />;
		}
		return (
			<ScrollView style={styles.container}>
				<View style={styles.avatarContainer} testID='room-info-view'>
					{this.renderAvatar(room, roomUser)}
					<View style={styles.roomTitleContainer}>{ getRoomTitle(room) }</View>
				</View>
				{!this.isDirect() ? this.renderItem('description', room) : null}
				{!this.isDirect() ? this.renderItem('topic', room) : null}
				{!this.isDirect() ? this.renderItem('announcement', room) : null}
				{this.isDirect() ? this.renderRoles() : null}
				{this.isDirect() ? this.renderTimezone(roomUser._id) : null}
				{room.broadcast ? this.renderBroadcast() : null}
			</ScrollView>
		);
	}
}

const mapStateToProps = state => ({
	baseUrl: state.settings.Site_Url || state.server ? state.server.server : '',
	user: state.login.user,
	activeUsers: state.activeUsers,
	Message_TimeFormat: state.settings.Message_TimeFormat,
	roles: state.roles
});

export default connect(mapStateToProps, null, null, { withRef: true })(RoomInfoView);
